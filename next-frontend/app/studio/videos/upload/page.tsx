import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { StudioNav } from "@/components/app/studio-nav";
import { VideoUploadForm } from "@/components/studio/video-upload-form";
import { getSession } from "@/lib/auth/session";
import { getCategories } from "@/lib/streamtube/server";

export default async function StudioUploadPage() {
  const session = await getSession();
  if (!session.isLoggedIn) {
    redirect("/login");
  }

  const categories = await getCategories();

  return (
    <div className="min-h-full bg-background">
      <AppHeader session={session} />

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
        <div>
          <h1 className="text-display">Upload</h1>
          <p className="mt-2 text-body-lg text-muted-foreground">
            Start a multipart upload and queue the video for processing.
          </p>
        </div>

        <StudioNav />
        <VideoUploadForm categories={categories} />
      </main>
    </div>
  );
}
