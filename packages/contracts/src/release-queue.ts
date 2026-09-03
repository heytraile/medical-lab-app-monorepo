import { z } from "zod";
import { ActorSnapshotSchema } from "./audit";

export const ReleaseQueuePatientSchema = z.object({
  edgePatientId: z.string().optional(),
  displayName: z.string(),
  mrn: z.string(),
  dateOfBirth: z.string().nullable().optional(),
  sex: z.string().nullable().optional(),
});
export type ReleaseQueuePatient = z.infer<typeof ReleaseQueuePatientSchema>;

export const ReleaseQueueResultSchema = z.object({
  id: z.string(),
  testCode: z.string(),
  testName: z.string().nullable().optional(),
  value: z.string(),
  units: z.string().nullable().optional(),
  flag: z.string(),
  observedAt: z.string(),
  analyzerId: z.string(),
});
export type ReleaseQueueResult = z.infer<typeof ReleaseQueueResultSchema>;

export const ReleaseQueueGroupSchema = z.object({
  accessionNumber: z.string(),
  barcode: z.string(),
  patient: ReleaseQueuePatientSchema,
  submittedBy: ActorSnapshotSchema.nullable(),
  submittedAt: z.string().nullable(),
  accessionedBy: ActorSnapshotSchema.nullable(),
  accessionedAt: z.string().nullable(),
  results: z.array(ReleaseQueueResultSchema),
  testCount: z.number().int().nonnegative(),
  worstFlag: z.string(),
});
export type ReleaseQueueGroup = z.infer<typeof ReleaseQueueGroupSchema>;
