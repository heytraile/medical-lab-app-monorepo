import { z } from "zod";

export const DismissReleaseQueueAccessionRequestSchema = z.object({
  accessionNumber: z.string().min(1),
});
export type DismissReleaseQueueAccessionRequest = z.infer<
  typeof DismissReleaseQueueAccessionRequestSchema
>;

export const DismissReleaseQueueAccessionResponseSchema = z.object({
  accessionNumber: z.string(),
});
export type DismissReleaseQueueAccessionResponse = z.infer<
  typeof DismissReleaseQueueAccessionResponseSchema
>;

export const DismissAllReleasedFromQueueResponseSchema = z.object({
  dismissedCount: z.number().int().nonnegative(),
});
export type DismissAllReleasedFromQueueResponse = z.infer<
  typeof DismissAllReleasedFromQueueResponseSchema
>;
