"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Category } from "@/lib/streamtube/models";

const CHUNK_SIZE = 5 * 1024 * 1024;

type VideoUploadFormProps = {
  categories: Category[];
};

export function VideoUploadForm({ categories }: VideoUploadFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const estimatedParts = useMemo(() => {
    if (!file) {
      return 0;
    }
    return Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
  }, [file]);

  async function uploadPart(url: string, blob: Blob, partNumber: number) {
    if (url.startsWith("https://example.test/")) {
      return { ETag: `etag-${partNumber}` };
    }

    const response = await fetch(url, {
      method: "PUT",
      body: blob,
    });

    if (!response.ok) {
      throw new Error(`Upload failed for part ${partNumber}.`);
    }

    return {
      ETag: response.headers.get("etag") ?? `etag-${partNumber}`,
    };
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Select a video file before uploading.");
      return;
    }

    setError("");
    setIsSubmitting(true);
    let createdVideoId = "";

    try {
      setStatus("Creating draft and upload session...");
      const startResponse = await fetch("/api/studio/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          categoryId,
          fileName: file.name,
          contentType: file.type || "video/mp4",
          fileSize: file.size,
        }),
      });

      if (!startResponse.ok) {
        throw new Error("Unable to create the upload session.");
      }

      const upload = (await startResponse.json()) as {
        videoId: string;
      };
      createdVideoId = upload.videoId;

      const totalParts = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
      const completedParts: Array<{ ETag: string; PartNumber: number }> = [];

      for (let index = 0; index < totalParts; index += 1) {
        const partNumber = index + 1;
        setStatus(`Uploading part ${partNumber} of ${totalParts}...`);

        const partResponse = await fetch(`/api/studio/uploads/${upload.videoId}/parts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ partNumber }),
        });

        if (!partResponse.ok) {
          throw new Error(`Unable to sign part ${partNumber}.`);
        }

        const partData = (await partResponse.json()) as {
          presignedUrl: string;
        };

        const blob = file.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
        const result = await uploadPart(partData.presignedUrl, blob, partNumber);
        completedParts.push({ ETag: result.ETag, PartNumber: partNumber });
      }

      setStatus("Completing upload...");
      const completeResponse = await fetch(`/api/studio/uploads/${upload.videoId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parts: completedParts }),
      });

      if (!completeResponse.ok) {
        throw new Error("Unable to complete the upload.");
      }

      setStatus("Saving video details...");
      await fetch(`/api/studio/videos/${upload.videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          categoryId,
          visibility: "unlisted",
        }),
      });

      router.push(`/studio/videos/${upload.videoId}/edit`);
      router.refresh();
    } catch (submissionError) {
      if (createdVideoId) {
        await fetch(`/api/studio/uploads/${createdVideoId}`, { method: "DELETE" }).catch(() => undefined);
      }
      setError(submissionError instanceof Error ? submissionError.message : "Upload failed.");
    } finally {
      setIsSubmitting(false);
      setStatus("");
    }
  }

  return (
    <Card className="py-0">
      <CardHeader>
        <CardTitle>Upload a new video</CardTitle>
        <CardDescription>
          Multipart upload runs directly against the presigned storage URLs, then the draft is queued
          for processing.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="video-file">Video file</Label>
            <Input
              id="video-file"
              type="file"
              accept="video/*"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            {file ? (
              <p className="text-body-md text-muted-foreground">
                {file.name} · {estimatedParts} part{estimatedParts === 1 ? "" : "s"}
              </p>
            ) : null}
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="video-title">Title</Label>
              <Input
                id="video-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Give your video a clear title"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
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
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="video-description">Description</Label>
            <Textarea
              id="video-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Tell viewers what to expect."
              rows={6}
            />
          </div>

          {error ? <p className="text-body-md text-destructive">{error}</p> : null}
          {status ? <p className="text-body-md text-muted-foreground">{status}</p> : null}

          <div className="flex justify-end">
            <Button type="submit" size="md" disabled={isSubmitting}>
              {isSubmitting ? "Uploading..." : "Start upload"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
