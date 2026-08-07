import Link from "next/link";

import { AppHeader } from "@/components/app/app-header";
import { CategoryChips } from "@/components/app/category-chips";
import { VideoCard } from "@/components/app/video-card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { getCategories, getHomeFeed } from "@/lib/streamtube/server";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string; q?: string }>;
}) {
  const session = await getSession();
  const params = await searchParams;
  const page = Number(params.page ?? "1");
  const [categories, feed] = await Promise.all([
    getCategories(),
    getHomeFeed({
      page,
      limit: 12,
      category: params.category,
      query: params.q,
    }),
  ]);

  return (
    <div className="min-h-full bg-background">
      <AppHeader session={session} query={params.q} />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 md:px-6">
        <section className="flex flex-col gap-4">
          <div>
            <h1 className="text-display">Discover videos</h1>
            <p className="mt-2 text-body-lg text-muted-foreground">
              Browse recent uploads, filter by category, or search the catalog.
            </p>
          </div>
          <CategoryChips categories={categories} active={params.category} query={params.q} />
        </section>

        <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {feed.items.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </section>

        {feed.items.length === 0 ? (
          <p className="text-body-lg text-muted-foreground">No videos matched the current filters.</p>
        ) : null}

        {feed.hasMore ? (
          <div className="flex justify-center">
            <Button asChild variant="outline" size="md">
              <Link
                href={`/?${new URLSearchParams({
                  ...(params.category ? { category: params.category } : {}),
                  ...(params.q ? { q: params.q } : {}),
                  page: String(feed.page + 1),
                })}`}
              >
                Load more
              </Link>
            </Button>
          </div>
        ) : null}
      </main>
    </div>
  );
}
