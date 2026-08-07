import Link from "next/link";

const items = [
  { href: "/studio/videos", label: "Videos" },
  { href: "/studio/videos/upload", label: "Upload" },
  { href: "/studio/channel", label: "Channel" },
  { href: "/studio/subscriptions", label: "Subscriptions" },
];

export function StudioNav() {
  return (
    <nav className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="rounded-[var(--radius-full)] bg-muted px-4 py-2 text-body-md text-foreground transition-colors hover:bg-accent"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
