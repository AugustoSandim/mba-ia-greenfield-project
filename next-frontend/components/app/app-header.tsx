import Link from "next/link";

import { BrandLogo } from "@/components/auth/brand-logo";
import { LogoutButton } from "@/components/app/logout-button";
import { SearchForm } from "@/components/app/search-form";
import { Button } from "@/components/ui/button";
import type { SessionData } from "@/lib/auth/session";

type AppHeaderProps = {
  session: Partial<SessionData>;
  query?: string;
};

export function AppHeader({ session, query }: AppHeaderProps) {
  const isLoggedIn = Boolean(session.isLoggedIn);

  return (
    <header className="border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="shrink-0">
            <BrandLogo size="md" />
          </Link>

          <div className="md:hidden">
            {isLoggedIn ? (
              <LogoutButton />
            ) : (
              <Button asChild size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
            )}
          </div>
        </div>

        <div className="w-full md:max-w-xl">
          <SearchForm initialQuery={query} />
        </div>

        <div className="hidden items-center gap-3 md:flex">
          {isLoggedIn ? (
            <>
              <span className="text-body-md text-muted-foreground">
                @{session.channelSlug || session.email || "creator"}
              </span>
              <Button asChild variant="ghost" size="sm">
                <Link href="/studio/videos">Studio</Link>
              </Button>
              <LogoutButton />
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/signup">Create account</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
