import type { ActorSnapshot } from "@drax-lis/contracts";

export function parseActor(
  value: ActorSnapshot | string | null | undefined,
): ActorSnapshot | null {
  if (!value) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as ActorSnapshot;
  } catch {
    return null;
  }
}

export function actorName(
  value: ActorSnapshot | string | null | undefined,
): string {
  const actor = parseActor(value);
  return actor?.fullName?.trim() || actor?.email?.trim() || "Unknown staff";
}

export function formatAttributionTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "time unavailable";
}
