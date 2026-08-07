import Link from "next/link";

import { AppHeader } from "@/components/app/app-header";
import { VideoCard } from "@/components/app/video-card";
import { WatchExperience } from "@/components/watch/watch-experience";
import { getSession } from "@/lib/auth/session";
import { getRelatedVideos, getVideoComments, getWatchVideo } from "@/lib/streamtube/server";

export default async function WatchPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const session = await getSession();
  const { publicId } = await params;
  const [video, related, comments] = await Promise.all([
    getWatchVideo(publicId),
    getRelatedVideos(publicId),
    getVideoComments(publicId),
  ]);

  return (
    <div className="min-h-full bg-background">
      <AppHeader session={session} />

      <main className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_360px] md:px-6">
        <section className="min-w-0">
          <WatchExperience video={video} initialComments={comments} />
        </section>

        <aside className="flex flex-col gap-4">
          <div className="rounded-[var(--radius-4)] border border-border p-4">
            <Link href={`/c/${video.channel.nickname}`} className="text-label-lg hover:underline">
              {video.channel.name}
            </Link>
            <p className="mt-2 text-body-md text-muted-foreground">{video.channel.description}</p>
          </div>

          <div className="flex flex-col gap-4">
            <h2 className="text-h2">Related videos</h2>
            {related.map((item) => (
              <VideoCard key={item.id} video={item} compact />
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
}
