import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { StudioNav } from "@/components/app/studio-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { formatPublishedAt, formatViews } from "@/lib/streamtube/format";
import { getMyVideos } from "@/lib/streamtube/server";

export default async function StudioVideosPage() {
  const session = await getSession();
  if (!session.isLoggedIn) {
    redirect("/login");
  }

  const videos = await getMyVideos();

  return (
    <div className="min-h-full bg-background">
      <AppHeader session={session} />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 md:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-display">Studio dashboard</h1>
            <p className="mt-2 text-body-lg text-muted-foreground">
              Manage uploads, publishing, and channel details.
            </p>
          </div>
          <Button asChild size="md">
            <Link href="/studio/videos/upload">Upload video</Link>
          </Button>
        </div>

        <StudioNav />

        <section className="grid gap-4">
          {videos.map((video) => (
            <Card key={video.id} className="py-0">
              <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 flex-1 gap-4">
                  <div className="relative h-20 w-36 shrink-0 overflow-hidden rounded-[var(--radius-3)] bg-muted">
                    {video.thumbnailUrl ? (
                      <Image
                        src={video.thumbnailUrl}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="144px"
                        unoptimized
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <CardTitle>{video.title}</CardTitle>
                    <p className="mt-2 text-body-md text-muted-foreground">
                      {video.status} · {video.visibility} · {formatViews(video.viewsCount)} views ·{" "}
                      {video.likesCount} likes · {video.commentsCount} comments ·{" "}
                      {formatPublishedAt(video.publishedAt)}
                    </p>
                  </div>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/studio/videos/${video.id}/edit`}>Edit video</Link>
                </Button>
              </CardHeader>
              <CardContent className="pb-4">
                <p className="line-clamp-2 text-body-md text-muted-foreground">{video.description}</p>
              </CardContent>
            </Card>
          ))}
        </section>
      </main>
    </div>
  );
}
