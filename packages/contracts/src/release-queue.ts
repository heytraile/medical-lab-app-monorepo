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

export const MissingExpectedResultSchema = z.object({
  orderedTestCode: z.string(),
  orderedTestName: z.string(),
  componentCode: z.string(),
  componentName: z.string(),
  workflow: z.enum([
    "instrument_only",
    "manual_only",
    "hybrid",
    "send_out",
  ]),
  confirmationStatus: z.enum(["provisional", "lab_confirmed"]),
});
export type MissingExpectedResult = z.infer<
  typeof MissingExpectedResultSchema
>;

export const ReleaseQueuePhaseSchema = z.enum([
  "pending_authorization",
  "released",
]);
export type ReleaseQueuePhase = z.infer<typeof ReleaseQueuePhaseSchema>;

export const ReleaseQueueGroupSchema = z.object({
  accessionNumber: z.string(),
  barcode: z.string(),
  patient: ReleaseQueuePatientSchema,
  queuePhase: ReleaseQueuePhaseSchema,
  submittedBy: ActorSnapshotSchema.nullable(),
  submittedAt: z.string().nullable(),
  accessionedBy: ActorSnapshotSchema.nullable(),
  accessionedAt: z.string().nullable(),
  releasedBy: ActorSnapshotSchema.nullable().optional(),
  releasedAt: z.string().nullable().optional(),
  results: z.array(ReleaseQueueResultSchema),
  missingExpectedResults: z.array(MissingExpectedResultSchema).default([]),
  submittedIncomplete: z.boolean().default(false),
  testCount: z.number().int().nonnegative(),
  worstFlag: z.string(),
});
export type ReleaseQueueGroup = z.infer<typeof ReleaseQueueGroupSchema>;
