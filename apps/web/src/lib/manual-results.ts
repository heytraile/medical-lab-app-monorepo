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

export type ManualAccessionAccess = "editable" | "submitted" | "released";

export function manualAccessionAccess(
  results: Array<{ status?: string | null }>,
): ManualAccessionAccess {
  if (results.some((result) => result.status === "released")) {
    return "released";
  }
  if (results.some((result) => result.status === "pending_authorization")) {
    return "submitted";
  }
  return "editable";
}
