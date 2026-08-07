import { AppHeader } from "@/components/app/app-header";
import { VideoCard } from "@/components/app/video-card";
import { SubscribeButton } from "@/components/channel/subscribe-button";
import { getSession } from "@/lib/auth/session";
import { getPublicChannel } from "@/lib/streamtube/server";

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ nickname: string }>;
}) {
  const session = await getSession();
  const { nickname } = await params;
  const { channel, videos } = await getPublicChannel(nickname);

  return (
    <div className="min-h-full bg-background">
      <AppHeader session={session} />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 md:px-6">
        <section className="rounded-[var(--radius-4)] border border-border bg-card p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-body-md text-muted-foreground">@{channel.nickname}</p>
              <h1 className="mt-2 text-display">{channel.name}</h1>
              <p className="mt-3 max-w-3xl text-body-lg text-muted-foreground">
                {channel.description}
              </p>
              <p className="mt-4 text-body-md text-muted-foreground">
                {channel.subscribersCount} subscribers · {channel.videosCount} videos
              </p>
            </div>

            {session.isLoggedIn ? (
              <SubscribeButton
                nickname={channel.nickname}
                initialSubscribed={channel.isSubscribed}
              />
            ) : null}
          </div>
        </section>

        <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </section>
      </main>
    </div>
  );
}
