export function formatViews(value: number) {
  return new Intl.NumberFormat("en", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatDuration(value: number | null) {
  if (!value || value <= 0) {
    return null;
  }

  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;

  const parts = [hours, minutes, seconds]
    .filter((part, index) => part > 0 || index > 0)
    .map((part) => String(part).padStart(2, "0"));

  return parts.join(":");
}

export function formatPublishedAt(value: string | null) {
  if (!value) {
    return "Draft";
  }

  const date = new Date(value);
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
