const DEV_DEFAULTS = [
  "http://localhost:3100",
  "http://127.0.0.1:3100",
  "http://localhost:3101",
  "http://127.0.0.1:3101",
];

/** Comma-separated browser origins allowed to call the edge API and Socket.IO. */
export function getCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw) return DEV_DEFAULTS;
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}
