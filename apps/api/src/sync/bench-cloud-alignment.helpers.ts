export type EdgeBenchRow = {
  id: string;
  accessionNumber: string;
  testCode: string;
  status: string;
};

export type CloudResultRow = {
  id: string;
  edge_result_id: string | null;
  accession_number: string;
  test_code: string;
  status: string;
};

export type BenchAlignmentIssueKind =
  | "orphan_cloud_row"
  | "orphan_edge_link"
  | "status_drift";

export type BenchAlignmentIssue = {
  kind: BenchAlignmentIssueKind;
  cloudId: string;
  edgeResultId: string | null;
  accessionNumber: string;
  testCode: string;
  cloudStatus: string;
  edgeStatus: string | null;
};

export type BenchCloudAlignmentPlan = {
  aligned: boolean;
  issues: BenchAlignmentIssue[];
  deleteEdgeResultIds: string[];
  deleteCloudIds: string[];
  resetEdgeResultIds: string[];
};

export type BenchCloudAlignmentSummary = BenchCloudAlignmentPlan & {
  edgeResultCount: number;
  cloudResultCount: number;
  staleReleasedCount: number;
  orphanCloudCount: number;
};

export function buildBenchCloudAlignmentPlan(
  edgeRows: EdgeBenchRow[],
  cloudRows: CloudResultRow[],
): BenchCloudAlignmentPlan {
  const edgeById = new Map(edgeRows.map((row) => [row.id, row]));
  const issues: BenchAlignmentIssue[] = [];
  const deleteEdgeResultIds = new Set<string>();
  const deleteCloudIds = new Set<string>();
  const resetEdgeResultIds = new Set<string>();

  for (const cloud of cloudRows) {
    const edgeResultId = String(cloud.edge_result_id ?? "").trim();
    const accessionNumber = String(cloud.accession_number ?? "");
    const testCode = String(cloud.test_code ?? "");
    const cloudStatus = String(cloud.status ?? "pending_review");

    if (!edgeResultId) {
      issues.push({
        kind: "orphan_cloud_row",
        cloudId: cloud.id,
        edgeResultId: null,
        accessionNumber,
        testCode,
        cloudStatus,
        edgeStatus: null,
      });
      deleteCloudIds.add(cloud.id);
      continue;
    }

    const edge = edgeById.get(edgeResultId);
    if (!edge) {
      issues.push({
        kind: "orphan_edge_link",
        cloudId: cloud.id,
        edgeResultId,
        accessionNumber,
        testCode,
        cloudStatus,
        edgeStatus: null,
      });
      deleteEdgeResultIds.add(edgeResultId);
      continue;
    }

    const edgeStatus = String(edge.status ?? "pending_review");
    const cloudAhead =
      cloudStatus === "released" || cloudStatus === "pending_authorization";
    if (edgeStatus === "pending_review" && cloudAhead) {
      issues.push({
        kind: "status_drift",
        cloudId: cloud.id,
        edgeResultId,
        accessionNumber,
        testCode,
        cloudStatus,
        edgeStatus,
      });
      resetEdgeResultIds.add(edgeResultId);
    }
  }

  return {
    aligned: issues.length === 0,
    issues,
    deleteEdgeResultIds: [...deleteEdgeResultIds],
    deleteCloudIds: [...deleteCloudIds],
    resetEdgeResultIds: [...resetEdgeResultIds],
  };
}

export function summarizeBenchCloudAlignment(
  edgeRows: EdgeBenchRow[],
  cloudRows: CloudResultRow[],
  plan: BenchCloudAlignmentPlan,
): BenchCloudAlignmentSummary {
  const staleReleasedCount = plan.issues.filter(
    (issue) =>
      issue.kind === "orphan_edge_link" && issue.cloudStatus === "released",
  ).length;
  const orphanCloudCount = plan.issues.filter(
    (issue) => issue.kind === "orphan_cloud_row",
  ).length;

  return {
    ...plan,
    edgeResultCount: edgeRows.length,
    cloudResultCount: cloudRows.length,
    staleReleasedCount,
    orphanCloudCount,
  };
}
