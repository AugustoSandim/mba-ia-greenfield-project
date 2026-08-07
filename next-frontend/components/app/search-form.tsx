"use client";

import { useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SearchFormProps = {
  initialQuery?: string;
};

export function SearchForm({ initialQuery = "" }: SearchFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = query.trim();

    if (!nextQuery) {
      router.push("/");
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set("q", nextQuery);
    router.push(pathname === "/search" ? `/search?${params}` : `/search?q=${encodeURIComponent(nextQuery)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full items-center gap-2">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search videos"
        aria-label="Search videos"
        className="h-10 rounded-[var(--radius-full)] bg-muted"
      />
      <Button type="submit" size="sm" className="rounded-[var(--radius-full)]">
        Search
      </Button>
    </form>
  );
}
