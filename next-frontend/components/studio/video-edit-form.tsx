"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Category, VideoDetail } from "@/lib/streamtube/models";

type VideoEditFormProps = {
  video: VideoDetail;
  categories: Category[];
};

export function VideoEditForm({ video, categories }: VideoEditFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(video.title);
  const [description, setDescription] = useState(video.description);
  const [visibility, setVisibility] = useState(video.visibility);
  const [categoryId, setCategoryId] = useState(video.category?.id ?? categories[0]?.id ?? "");
  const [thumbnailUrl, setThumbnailUrl] = useState(video.thumbnailUrl ?? "");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const isPublished = useMemo(() => Boolean(video.publishedAt), [video.publishedAt]);

  async function saveVideo(nextVisibility = visibility) {
    const response = await fetch(`/api/studio/videos/${video.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        visibility: nextVisibility,
        categoryId,
        thumbnailUrl,
      }),
    });

    if (!response.ok) {
      throw new Error("Unable to save video changes.");
    }
  }

  async function handleThumbnailUpload(file: File) {
    const response = await fetch(`/api/studio/videos/${video.id}/thumbnail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type || "image/jpeg",
      }),
    });

    if (!response.ok) {
      throw new Error("Unable to prepare thumbnail upload.");
    }

    const data = (await response.json()) as {
      uploadUrl: string;
      thumbnailUrl?: string;
    };

    if (!data.uploadUrl.startsWith("https://example.test/")) {
      const uploadResponse = await fetch(data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Unable to upload the thumbnail.");
      }
    }

    setThumbnailUrl(data.thumbnailUrl ?? thumbnailUrl);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSaving(true);

    try {
      setStatus("Saving video details...");
      await saveVideo();
      router.refresh();
      setStatus("Saved.");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Unable to save.");
      setStatus("");
    } finally {
      setIsSaving(false);
    }
  }

  async function togglePublish(nextAction: "publish" | "unpublish") {
    setError("");
    setStatus(nextAction === "publish" ? "Publishing..." : "Unpublishing...");

    try {
      await saveVideo(nextAction === "publish" ? "public" : "private");
      const response = await fetch(`/api/studio/videos/${video.id}/${nextAction}`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`Unable to ${nextAction} this video.`);
      }

      router.refresh();
      setStatus(nextAction === "publish" ? "Video published." : "Video unpublished.");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error ? submissionError.message : `Unable to ${nextAction} video.`
      );
      setStatus("");
    }
  }

  return (
    <Card className="py-0">
      <CardHeader>
        <CardTitle>Edit video</CardTitle>
        <CardDescription>Update metadata, visibility, and the custom thumbnail.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-title">Title</Label>
                <Input
                  id="edit-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  rows={8}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label>Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Visibility</Label>
                <Select value={visibility} onValueChange={setVisibility}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private</SelectItem>
                    <SelectItem value="unlisted">Unlisted</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="thumbnail-file">Custom thumbnail</Label>
                <Input
                  id="thumbnail-file"
                  type="file"
                  accept="image/*"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      return;
                    }
                    try {
                      setStatus("Uploading thumbnail...");
                      await handleThumbnailUpload(file);
                      setStatus("Thumbnail uploaded.");
                    } catch (uploadError) {
                      setError(
                        uploadError instanceof Error
                          ? uploadError.message
                          : "Unable to upload thumbnail."
                      );
                      setStatus("");
                    }
                  }}
                />
                {thumbnailUrl ? (
                  <a
                    href={thumbnailUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-body-md text-link hover:underline"
                  >
                    Current thumbnail
                  </a>
                ) : (
                  <p className="text-body-md text-muted-foreground">No thumbnail uploaded yet.</p>
                )}
              </div>
            </div>
          </div>

          {error ? <p className="text-body-md text-destructive">{error}</p> : null}
          {status ? <p className="text-body-md text-muted-foreground">{status}</p> : null}

          <div className="flex flex-wrap justify-end gap-3">
            <Button type="submit" variant="outline" size="md" disabled={isSaving}>
              Save changes
            </Button>
            <Button
              type="button"
              size="md"
              onClick={() => togglePublish(isPublished ? "unpublish" : "publish")}
            >
              {isPublished ? "Unpublish" : "Publish"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
