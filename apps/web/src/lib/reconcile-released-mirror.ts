import { api, ApiError } from "./api";

export type MirrorReconcileOutcome =
  | { status: "mirrored" }
  | { status: "dismissed-stale" }
  | { status: "bench-not-found" }
  | { status: "failed"; retryable: boolean };

async function mirrorWithRetries(accessionNumber: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await api.markAccessionReleased(accessionNumber);
      return;
    } catch (error) {
      lastError = error;
      // Nothing to mirror on edge — don't waste retries.
      if (error instanceof ApiError && error.status === 404) throw error;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

/**
 * After cloud release, mark the same accession released on edge (bench mirror).
 * Ready-to-send visibility is driven by cloud release state — never auto-dismiss
 * here (that silently emptied Ready during demos when edge drifted).
 */
export async function reconcileReleasedMirror(opts: {
  accessionNumber: string;
  /** @deprecated No longer auto-dismisses; kept for call-site compatibility. */
  canDismissStale?: boolean;
}): Promise<MirrorReconcileOutcome> {
  void opts.canDismissStale;
  try {
    await mirrorWithRetries(opts.accessionNumber);
    return { status: "mirrored" };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return { status: "bench-not-found" };
    }
    return { status: "failed", retryable: true };
  }
}
