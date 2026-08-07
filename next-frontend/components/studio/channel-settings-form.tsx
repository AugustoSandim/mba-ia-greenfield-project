"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ChannelSummary } from "@/lib/streamtube/models";

type ChannelSettingsFormProps = {
  channel: ChannelSummary;
};

export function ChannelSettingsForm({ channel }: ChannelSettingsFormProps) {
  const router = useRouter();
  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState(channel.description);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setStatus("Saving channel settings...");

    try {
      const response = await fetch("/api/studio/channel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });

      if (!response.ok) {
        throw new Error("Unable to save channel settings.");
      }

      router.refresh();
      setStatus("Saved.");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Unable to save.");
      setStatus("");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className="py-0">
      <CardHeader>
        <CardTitle>Channel settings</CardTitle>
        <CardDescription>Manage the public information for your channel page.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="channel-name">Display name</Label>
            <Input id="channel-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="channel-nickname">Channel URL</Label>
            <Input id="channel-nickname" value={`streamtube.local/c/${channel.nickname}`} readOnly />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="channel-description">Description</Label>
            <Textarea
              id="channel-description"
              rows={7}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          {error ? <p className="text-body-md text-destructive">{error}</p> : null}
          {status ? <p className="text-body-md text-muted-foreground">{status}</p> : null}

          <div className="flex justify-end">
            <Button type="submit" size="md" disabled={isSaving}>
              Save channel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
