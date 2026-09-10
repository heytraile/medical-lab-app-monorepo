import { z } from "zod";

export const BenchAlignmentIssueKindSchema = z.enum([
  "orphan_cloud_row",
  "orphan_edge_link",
  "status_drift",
]);
export type BenchAlignmentIssueKind = z.infer<
  typeof BenchAlignmentIssueKindSchema
>;

export const BenchAlignmentIssueSchema = z.object({
  kind: BenchAlignmentIssueKindSchema,
  cloudId: z.string(),
  edgeResultId: z.string().nullable(),
  accessionNumber: z.string(),
  testCode: z.string(),
  cloudStatus: z.string(),
  edgeStatus: z.string().nullable(),
});
export type BenchAlignmentIssue = z.infer<typeof BenchAlignmentIssueSchema>;

export const BenchCloudAlignmentSchema = z.object({
  aligned: z.boolean(),
  edgeResultCount: z.number().int().nonnegative(),
  cloudResultCount: z.number().int().nonnegative(),
  staleReleasedCount: z.number().int().nonnegative(),
  orphanCloudCount: z.number().int().nonnegative(),
  issues: z.array(BenchAlignmentIssueSchema),
});
export type BenchCloudAlignment = z.infer<typeof BenchCloudAlignmentSchema>;

export const BenchCloudReconcileResultSchema = z.object({
  aligned: z.boolean(),
  dryRun: z.boolean(),
  deletedByEdgeResultId: z.number().int().nonnegative(),
  deletedByCloudId: z.number().int().nonnegative(),
  reset: z.number().int().nonnegative(),
  dismissedAccessions: z.number().int().nonnegative(),
  issuesBefore: z.number().int().nonnegative(),
});
export type BenchCloudReconcileResult = z.infer<
  typeof BenchCloudReconcileResultSchema
>;
