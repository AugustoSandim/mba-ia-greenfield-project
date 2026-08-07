import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { StudioNav } from "@/components/app/studio-nav";
import { VideoEditForm } from "@/components/studio/video-edit-form";
import { getSession } from "@/lib/auth/session";
import { normalizeVideoDetail } from "@/lib/streamtube/models";
import { getCategories, getMyVideos } from "@/lib/streamtube/server";

export default async function StudioVideoEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    redirect("/login");
  }

  const { id } = await params;
  const [categories, videos] = await Promise.all([getCategories(), getMyVideos()]);
  const video = videos.find((item) => item.id === id);

  if (!video) {
    notFound();
  }

  return (
    <div className="min-h-full bg-background">
      <AppHeader session={session} />

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
        <div>
          <h1 className="text-display">Edit video</h1>
          <p className="mt-2 text-body-lg text-muted-foreground">
            Update metadata, visibility, publishing, and the custom thumbnail.
          </p>
        </div>

        <StudioNav />
        <VideoEditForm video={normalizeVideoDetail(video)} categories={categories} />
      </main>
    </div>
  );
}
