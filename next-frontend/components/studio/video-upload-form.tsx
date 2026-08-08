"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Category } from "@/lib/streamtube/models";
import {
  buildFileKey,
  clearUploadSession,
  findResumableSession,
  nextPartNumbers,
  saveUploadSession,
  type CompletedUploadPart,
  type UploadSession,
} from "@/lib/studio/upload-session";

const CHUNK_SIZE = 5 * 1024 * 1024;

type VideoUploadFormProps = {
  categories: Category[];
};

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

export function VideoUploadForm({ categories }: VideoUploadFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [resumableSession, setResumableSession] = useState<UploadSession | null>(null);

  const estimatedParts = useMemo(() => {
    if (!file) {
      return 0;
    }
    return Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
  }, [file]);

  useEffect(() => {
    if (!file) {
      setResumableSession(null);
      return;
    }
    setResumableSession(findResumableSession(file));
  }, [file]);

  async function runUpload(
    selectedFile: File,
    metadata: { title: string; description: string; categoryId: string },
    existingSession?: UploadSession | null
  ) {
    setError("");
    setIsSubmitting(true);
    let createdVideoId = existingSession?.videoId ?? "";
    let completedParts: CompletedUploadPart[] = existingSession?.completedParts ?? [];

    try {
      if (!existingSession) {
        setStatus("Creating draft and upload session...");
        const startResponse = await fetch("/api/studio/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: metadata.title,
            description: metadata.description,
            categoryId: metadata.categoryId,
            fileName: selectedFile.name,
            contentType: selectedFile.type || "video/mp4",
            fileSize: selectedFile.size,
          }),
        });

        if (!startResponse.ok) {
          throw new Error("Unable to create the upload session.");
        }

        const upload = (await startResponse.json()) as { videoId: string };
        createdVideoId = upload.videoId;
        completedParts = [];

        saveUploadSession({
          videoId: createdVideoId,
          fileKey: buildFileKey(selectedFile),
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          fileLastModified: selectedFile.lastModified,
          contentType: selectedFile.type || "video/mp4",
          title: metadata.title,
          description: metadata.description,
          categoryId: metadata.categoryId,
          completedParts,
          updatedAt: new Date().toISOString(),
        });
      } else {
        setStatus(`Resuming upload (${completedParts.length} parts already sent)...`);
      }

      const totalParts = Math.max(1, Math.ceil(selectedFile.size / CHUNK_SIZE));
      const pendingParts = nextPartNumbers(totalParts, completedParts);

      for (const partNumber of pendingParts) {
        setStatus(`Uploading part ${partNumber} of ${totalParts}...`);

        const partResponse = await fetch(`/api/studio/uploads/${createdVideoId}/parts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ partNumber }),
        });

        if (!partResponse.ok) {
          throw new Error(`Unable to sign part ${partNumber}.`);
        }

        const partData = (await partResponse.json()) as { presignedUrl: string };
        const blob = selectedFile.slice(
          (partNumber - 1) * CHUNK_SIZE,
          partNumber * CHUNK_SIZE
        );
        const result = await uploadPart(partData.presignedUrl, blob, partNumber);
        completedParts = [...completedParts, { ETag: result.ETag, PartNumber: partNumber }];

        saveUploadSession({
          videoId: createdVideoId,
          fileKey: buildFileKey(selectedFile),
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          fileLastModified: selectedFile.lastModified,
          contentType: selectedFile.type || "video/mp4",
          title: metadata.title,
          description: metadata.description,
          categoryId: metadata.categoryId,
          completedParts,
          updatedAt: new Date().toISOString(),
        });
      }

      setStatus("Completing upload...");
      const completeResponse = await fetch(`/api/studio/uploads/${createdVideoId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parts: completedParts }),
      });

      if (!completeResponse.ok) {
        throw new Error("Unable to complete the upload.");
      }

      setStatus("Saving video details...");
      await fetch(`/api/studio/videos/${createdVideoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: metadata.title,
          description: metadata.description,
          categoryId: metadata.categoryId,
          visibility: "unlisted",
        }),
      });

      clearUploadSession();
      router.push(`/studio/videos/${createdVideoId}/edit`);
      router.refresh();
    } catch (submissionError) {
      if (createdVideoId && completedParts.length === 0) {
        await fetch(`/api/studio/uploads/${createdVideoId}`, { method: "DELETE" }).catch(
          () => undefined
        );
        clearUploadSession();
      }
      setError(
        submissionError instanceof Error
          ? `${submissionError.message} You can retry with the same file to resume.`
          : "Upload failed. You can retry with the same file to resume."
      );
    } finally {
      setIsSubmitting(false);
      setStatus("");
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Select a video file before uploading.");
      return;
    }

    await runUpload(file, { title, description, categoryId });
  }

  async function onResume() {
    if (!file || !resumableSession) {
      return;
    }

    setTitle(resumableSession.title);
    setDescription(resumableSession.description);
    setCategoryId(resumableSession.categoryId);
    await runUpload(file, {
      title: resumableSession.title,
      description: resumableSession.description,
      categoryId: resumableSession.categoryId,
    }, resumableSession);
  }

  function onDiscardResume() {
    clearUploadSession();
    setResumableSession(null);
  }

  return (
    <Card className="py-0">
      <CardHeader>
        <CardTitle>Upload a new video</CardTitle>
        <CardDescription>
          Multipart upload runs directly against the presigned storage URLs, then the draft is queued
          for processing. Interrupted uploads can be resumed by selecting the same file again.
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
            {resumableSession ? (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
                <p className="text-body-md text-muted-foreground">
                  Found an interrupted upload ({resumableSession.completedParts.length} of{" "}
                  {estimatedParts} parts sent).
                </p>
                <Button type="button" size="sm" onClick={onResume} disabled={isSubmitting}>
                  Resume upload
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onDiscardResume}
                  disabled={isSubmitting}
                >
                  Discard
                </Button>
              </div>
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
