import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { StudioNav } from "@/components/app/studio-nav";
import { ChannelSettingsForm } from "@/components/studio/channel-settings-form";
import { getSession } from "@/lib/auth/session";
import { getMyChannel } from "@/lib/streamtube/server";

export default async function StudioChannelPage() {
  const session = await getSession();
  if (!session.isLoggedIn) {
    redirect("/login");
  }

  const channel = await getMyChannel();

  return (
    <div className="min-h-full bg-background">
      <AppHeader session={session} />

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
        <div>
          <h1 className="text-display">Channel settings</h1>
          <p className="mt-2 text-body-lg text-muted-foreground">
            Edit your public profile and keep your creator page up to date.
          </p>
        </div>

        <StudioNav />
        <ChannelSettingsForm channel={channel} />
      </main>
    </div>
  );
}
