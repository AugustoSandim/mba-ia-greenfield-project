import Link from "next/link";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app/app-header";
import { StudioNav } from "@/components/app/studio-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { getSubscriptions } from "@/lib/streamtube/server";

export default async function StudioSubscriptionsPage() {
  const session = await getSession();
  if (!session.isLoggedIn) {
    redirect("/login");
  }

  const subscriptions = await getSubscriptions();

  return (
    <div className="min-h-full bg-background">
      <AppHeader session={session} />

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
        <div>
          <h1 className="text-display">Subscriptions</h1>
          <p className="mt-2 text-body-lg text-muted-foreground">
            Channels you currently follow.
          </p>
        </div>

        <StudioNav />

        <section className="grid gap-4">
          {subscriptions.map((channel) => (
            <Card key={channel.id} className="py-0">
              <CardHeader>
                <CardTitle>
                  <Link href={`/c/${channel.nickname}`} className="hover:underline">
                    {channel.name}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <p className="text-body-md text-muted-foreground">{channel.description}</p>
              </CardContent>
            </Card>
          ))}
        </section>
      </main>
    </div>
  );
}
