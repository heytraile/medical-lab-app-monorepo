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
  orderedTestCode: z.string().nullable().optional(),
  resultComponentCode: z.string().nullable().optional(),
  observedAt: z.string(),
  analyzerId: z.string(),
  manualEnteredBy: ActorSnapshotSchema.nullable().optional(),
  manualEnteredAt: z.string().nullable().optional(),
  manualLastEditedBy: ActorSnapshotSchema.nullable().optional(),
  manualLastEditedAt: z.string().nullable().optional(),
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

export const CollectorSnapshotSchema = z.object({
  staffId: z.string().optional(),
  fullName: z.string().optional(),
  jobTitle: z.string().nullable().optional(),
});
export type CollectorSnapshot = z.infer<typeof CollectorSnapshotSchema>;

export const ReleaseQueueGroupSchema = z.object({
  accessionNumber: z.string(),
  barcode: z.string(),
  patient: ReleaseQueuePatientSchema,
  queuePhase: ReleaseQueuePhaseSchema,
  submittedBy: ActorSnapshotSchema.nullable(),
  submittedAt: z.string().nullable(),
  accessionedBy: ActorSnapshotSchema.nullable(),
  accessionedAt: z.string().nullable(),
  collectedBy: CollectorSnapshotSchema.nullable().optional(),
  collectedAt: z.string().nullable().optional(),
  releasedBy: ActorSnapshotSchema.nullable().optional(),
  releasedAt: z.string().nullable().optional(),
  results: z.array(ReleaseQueueResultSchema),
  missingExpectedResults: z.array(MissingExpectedResultSchema).default([]),
  submittedIncomplete: z.boolean().default(false),
  testCount: z.number().int().nonnegative(),
  worstFlag: z.string(),
  hasAlarm: z.boolean().default(false),
  hasCritical: z.boolean().default(false),
});
export type ReleaseQueueGroup = z.infer<typeof ReleaseQueueGroupSchema>;
