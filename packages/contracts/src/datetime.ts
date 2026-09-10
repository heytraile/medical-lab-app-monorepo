/**
 * Normalize Postgres / Supabase timestamps to strict ISO-8601 (Z suffix) for Zod
 * `.datetime()` validation and JSON APIs.
 */
export function normalizeIsoDateTime(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value !== "string" || !value.trim()) {
    return new Date(0).toISOString();
  }

  let s = value.trim().replace(" ", "T");
  // Postgres timestamptz: +00 or +00:00 instead of Z
  s = s.replace(/(\.\d+)?\+00:00$/, (_, frac) => `${frac ?? ""}Z`);
  s = s.replace(/(\.\d+)?\+00$/, (_, frac) => `${frac ?? ""}Z`);

  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(0).toISOString();
  }
  return parsed.toISOString();
}
