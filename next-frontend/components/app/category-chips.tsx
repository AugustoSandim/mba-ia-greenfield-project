import Link from "next/link";

import { cn } from "@/lib/utils";
import type { Category } from "@/lib/streamtube/models";

type CategoryChipsProps = {
  categories: Category[];
  active?: string;
  basePath?: string;
  query?: string;
};

export function CategoryChips({
  categories,
  active,
  basePath = "/",
  query,
}: CategoryChipsProps) {
  const buildHref = (slug?: string) => {
    const params = new URLSearchParams();
    if (slug) {
      params.set("category", slug);
    }
    if (query) {
      params.set("q", query);
    }
    const suffix = params.toString();
    return suffix ? `${basePath}?${suffix}` : basePath;
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={buildHref()}
        className={cn(
          "rounded-[var(--radius-full)] px-4 py-2 text-body-md transition-colors",
          !active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-accent"
        )}
      >
        All
      </Link>

      {categories.map((category) => (
        <Link
          key={category.id}
          href={buildHref(category.slug)}
          className={cn(
            "rounded-[var(--radius-full)] px-4 py-2 text-body-md transition-colors",
            active === category.slug
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground hover:bg-accent"
          )}
        >
          {category.name}
        </Link>
      ))}
    </div>
  );
}
