/** Do not overwrite cloud rows after clinical release. */
export function shouldApplyResultBatchUpdate(
  existingStatus: string | null | undefined,
): boolean {
  return existingStatus !== "released";
}

type ManualEntryAttribution = {
  manual_entered_by?: unknown;
  manual_entered_by_snapshot?: unknown;
  manual_entered_at?: unknown;
};

/** Entry attribution is write-once; later syncs may only change edit attribution. */
export function preserveManualEntryAttribution(
  existing: ManualEntryAttribution | null | undefined,
  incoming: {
    manualEnteredBy?: unknown;
    manualEnteredBySnapshot?: unknown;
    manualEnteredAt?: unknown;
  },
) {
  return {
    manual_entered_by:
      existing?.manual_entered_by ?? incoming.manualEnteredBy ?? null,
    manual_entered_by_snapshot:
      existing?.manual_entered_by_snapshot ??
      incoming.manualEnteredBySnapshot ??
      null,
    manual_entered_at:
      existing?.manual_entered_at ?? incoming.manualEnteredAt ?? null,
  };
}
