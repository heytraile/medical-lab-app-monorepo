export type ResultWorkflowCounts = {
  pendingCount: number;
  submittedCount: number;
  releasedCount: number;
  allReleased: boolean;
};

/** Derive workflow state from one explicit result set (normally one accession). */
export function summarizeResultStatuses(
  results: Array<{ status?: string | null }>,
): ResultWorkflowCounts {
  return {
    pendingCount: results.filter(
      (result) => (result.status ?? "pending_review") === "pending_review",
    ).length,
    submittedCount: results.filter(
      (result) => result.status === "pending_authorization",
    ).length,
    releasedCount: results.filter((result) => result.status === "released")
      .length,
    allReleased:
      results.length > 0 &&
      results.every((result) => result.status === "released"),
  };
}
