import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDuration, formatPublishedAt, formatViews } from "@/lib/streamtube/format";
import type { VideoSummary } from "@/lib/streamtube/models";

type VideoCardProps = {
  video: VideoSummary;
  compact?: boolean;
};

export function VideoCard({ video, compact = false }: VideoCardProps) {
  const duration = formatDuration(video.duration);

  return (
    <Card className="overflow-hidden border-none bg-transparent py-0 shadow-none">
      <Link href={`/watch/${video.publicId}`} className="group block">
        <div className="relative aspect-video overflow-hidden rounded-[var(--radius-4)] bg-muted">
          {video.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={video.thumbnailUrl}
              alt={video.title}
              className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-linear-to-br from-muted to-background text-center text-body-md text-muted-foreground">
              <span className="max-w-48 px-4">{video.title}</span>
            </div>
          )}
          {duration ? (
            <span className="absolute bottom-3 right-3 rounded bg-black/80 px-2 py-1 text-caption text-white">
              {duration}
            </span>
          ) : null}
        </div>
      </Link>

      <CardContent className="px-1 py-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Link href={`/watch/${video.publicId}`} className="line-clamp-2 text-label-lg hover:underline">
                {video.title}
              </Link>
              <Link
                href={`/c/${video.channel.nickname}`}
                className="mt-1 block text-body-md text-muted-foreground hover:text-foreground"
              >
                {video.channel.name}
              </Link>
            </div>

            {compact ? null : (
              <Badge variant="outline" className="capitalize">
                {video.visibility}
              </Badge>
            )}
          </div>

          <p className="text-body-md text-muted-foreground">
            {formatViews(video.viewsCount)} views · {formatPublishedAt(video.publishedAt)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
