import { AppHeader } from "@/components/app/app-header";
import { CategoryChips } from "@/components/app/category-chips";
import { VideoCard } from "@/components/app/video-card";
import { getSession } from "@/lib/auth/session";
import { getCategories, getHomeFeed } from "@/lib/streamtube/server";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const session = await getSession();
  const params = await searchParams;
  const [categories, feed] = await Promise.all([
    getCategories(),
    getHomeFeed({
      page: 1,
      limit: 12,
      category: params.category,
      query: params.q,
    }),
  ]);

  return (
    <div className="min-h-full bg-background">
      <AppHeader session={session} query={params.q} />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 md:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-display">Search results</h1>
          <p className="text-body-lg text-muted-foreground">
            {params.q ? `Showing matches for "${params.q}"` : "Use the search bar to find videos."}
          </p>
        </div>

        <CategoryChips
          categories={categories}
          active={params.category}
          basePath="/search"
          query={params.q}
        />

        <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {feed.items.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </section>
      </main>
    </div>
  );
}
