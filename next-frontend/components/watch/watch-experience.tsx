"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { formatPublishedAt, formatViews } from "@/lib/streamtube/format";
import type { CommentItem, VideoDetail } from "@/lib/streamtube/models";

type WatchExperienceProps = {
  video: VideoDetail;
  initialComments: CommentItem[];
};

function CommentBranch({
  comment,
  onReply,
}: {
  comment: CommentItem;
  onReply: (parentId: string, content: string) => Promise<void>;
}) {
  const [reply, setReply] = useState("");
  const [showReply, setShowReply] = useState(false);

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-4)] border border-border p-4">
      <div className="flex items-center gap-2">
        <span className="text-label-md">{comment.author.name}</span>
        <span className="text-body-md text-muted-foreground">@{comment.author.nickname}</span>
      </div>
      <p className="text-body-md text-foreground">{comment.content}</p>
      <div className="flex items-center gap-3 text-body-md text-muted-foreground">
        <span>{formatPublishedAt(comment.createdAt)}</span>
        <span>{comment.likesCount} likes</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowReply((value) => !value)}>
          Reply
        </Button>
      </div>

      {showReply ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!reply.trim()) {
              return;
            }
            await onReply(comment.id, reply);
            setReply("");
            setShowReply(false);
          }}
        >
          <Input value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write a reply" />
          <div className="flex justify-end">
            <Button type="submit" size="sm">
              Reply
            </Button>
          </div>
        </form>
      ) : null}

      {comment.replies.length > 0 ? (
        <div className="ml-4 flex flex-col gap-3 border-l border-border pl-4">
          {comment.replies.map((reply) => (
            <div key={reply.id} className="flex flex-col gap-1">
              <span className="text-label-md">{reply.author.name}</span>
              <p className="text-body-md text-foreground">{reply.content}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function WatchExperience({ video, initialComments }: WatchExperienceProps) {
  const [comments, setComments] = useState(initialComments);
  const [reaction, setReaction] = useState(video.viewerReaction);
  const [likesCount, setLikesCount] = useState(video.likesCount);
  const [dislikesCount, setDislikesCount] = useState(video.dislikesCount);
  const [commentDraft, setCommentDraft] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [viewTracked, setViewTracked] = useState(false);

  const commentCount = useMemo(() => comments.length, [comments]);

  async function submitReaction(value: "like" | "dislike" | "none") {
    const response = await fetch(`/api/videos/${video.publicId}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });

    if (!response.ok) {
      return;
    }

    const next = (await response.json()) as VideoDetail;
    setReaction(next.viewerReaction);
    setLikesCount(next.likesCount);
    setDislikesCount(next.dislikesCount);
  }

  async function createComment(content: string, parentId?: string) {
    const response = await fetch(`/api/videos/${video.publicId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, parentId: parentId ?? null }),
    });

    if (!response.ok) {
      return;
    }

    const next = (await response.json()) as CommentItem;
    if (!parentId) {
      setComments((current) => [next, ...current]);
      setCommentDraft("");
      return;
    }

    setComments((current) =>
      current.map((comment) =>
        comment.id === parentId ? { ...comment, replies: [...comment.replies, next] } : comment
      )
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-[var(--radius-4)] bg-black">
        <video
          controls
          preload="none"
          poster={video.thumbnailUrl ?? undefined}
          className="aspect-video w-full"
          src={`/api/videos/${video.publicId}/stream`}
          onPlay={() => {
            if (viewTracked) {
              return;
            }
            setViewTracked(true);
            void fetch(`/api/videos/${video.publicId}/views`, { method: "POST" });
          }}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h1 className="text-h1">{video.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-body-md text-muted-foreground">
          <span>{formatViews(video.viewsCount)} views</span>
          <span>{formatPublishedAt(video.publishedAt)}</span>
          <a href={`/api/videos/${video.publicId}/download`} className="text-link hover:underline">
            Download
          </a>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant={reaction === "like" ? "default" : "outline"}
          onClick={() => submitReaction(reaction === "like" ? "none" : "like")}
        >
          Like · {likesCount}
        </Button>
        <Button
          type="button"
          variant={reaction === "dislike" ? "default" : "outline"}
          onClick={() => submitReaction(reaction === "dislike" ? "none" : "dislike")}
        >
          Dislike · {dislikesCount}
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-4">
          <p className={expanded ? "text-body-md" : "line-clamp-3 text-body-md"}>{video.description}</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Show less" : "Show more"}
          </Button>
        </CardContent>
      </Card>

      <Separator />

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-h2">Comments</h2>
          <span className="text-body-md text-muted-foreground">{commentCount}</span>
        </div>

        <form
          className="flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!commentDraft.trim()) {
              return;
            }
            await createComment(commentDraft);
          }}
        >
          <Textarea
            rows={4}
            value={commentDraft}
            onChange={(event) => setCommentDraft(event.target.value)}
            placeholder="Share your thoughts"
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm">
              Add comment
            </Button>
          </div>
        </form>

        <div className="flex flex-col gap-4">
          {comments.map((comment) => (
            <CommentBranch key={comment.id} comment={comment} onReply={createComment} />
          ))}
        </div>
      </section>
    </div>
  );
}
