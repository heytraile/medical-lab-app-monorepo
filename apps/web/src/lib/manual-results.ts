/** Manual results are editable only on the bench (not submitted or released). */
export function canEditManualResult(r: {
  analyzerId: string;
  status?: string | null;
}): boolean {
  return (
    r.analyzerId === "manual" &&
    (r.status ?? "pending_review") === "pending_review"
  );
}
