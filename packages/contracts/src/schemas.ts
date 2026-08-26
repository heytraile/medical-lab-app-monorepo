import { z } from "zod";

/** Four physical analyzers at Drax Hall. */
export const AnalyzerIdSchema = z.enum([
  "sysmex_xs1000i",
  "diamond_prolyte",
  "mindray_bs240",
  "yhlo_iflash1200",
]);
export type AnalyzerId = z.infer<typeof AnalyzerIdSchema>;

export const AnalyzerTransportSchema = z.enum(["serial", "tcp"]);
export type AnalyzerTransport = z.infer<typeof AnalyzerTransportSchema>;

export const ProtocolKindSchema = z.enum([
  "astm_e1381",
  "astm_e1394",
  "hl7_mllp",
  "ascii_delimited",
]);
export type ProtocolKind = z.infer<typeof ProtocolKindSchema>;

export const OutboxStatusSchema = z.enum([
  "pending",
  "syncing",
  "acked",
  "failed",
]);
export type OutboxStatus = z.infer<typeof OutboxStatusSchema>;

export const ResultFlagSchema = z.enum([
  "normal",
  "low",
  "high",
  "critical_low",
  "critical_high",
  "abnormal",
  "unknown",
]);
export type ResultFlag = z.infer<typeof ResultFlagSchema>;

/** Clinical review state on a Result row (Bench → authorizer). */
export const ClinicalResultStatusSchema = z.enum([
  "pending_review",
  "released",
  "held",
  "rejected",
]);
export type ClinicalResultStatus = z.infer<typeof ClinicalResultStatusSchema>;

export const SpecimenStatusSchema = z.enum([
  "registered",
  "collected",
  "in_progress",
  "partial",
  "complete",
  "released",
  "cancelled",
]);
export type SpecimenStatus = z.infer<typeof SpecimenStatusSchema>;

export const PatientSchema = z.object({
  id: z.string().optional(),
  mrn: z.string().min(1).optional(),
  externalId: z.string().optional(),
  firstName: z.string().min(1),
  middleName: z.string().optional(),
  lastName: z.string().min(1),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sex: z.enum(["M", "F", "O", "U"]).optional(),
  status: z.enum(["active", "quarantined"]).optional(),
  identityOrigin: z.enum(["upstream", "local_provisional"]).optional(),
  syncStatus: z
    .enum(["n_a", "pending_upstream", "synced", "failed"])
    .optional(),
  suspectGroupId: z.string().optional(),
});
export type Patient = z.infer<typeof PatientSchema>;

export const CreatePatientRequestSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  middleName: z.string().optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sex: z.enum(["M", "F", "O", "U"]).optional(),
});
export type CreatePatientRequest = z.infer<typeof CreatePatientRequestSchema>;

export const IdentityConfirmationDecisionSchema = z.enum([
  "distinct_people",
  "possible_duplicate_acknowledged",
]);
export type IdentityConfirmationDecision = z.infer<
  typeof IdentityConfirmationDecisionSchema
>;

export const IdentityConfirmationSchema = z.object({
  decision: IdentityConfirmationDecisionSchema,
  suspectGroupId: z.string().min(1),
  confirmedAt: z.string().datetime().optional(),
  confirmedBy: z.string().optional(),
});
export type IdentityConfirmation = z.infer<typeof IdentityConfirmationSchema>;

export const OrderedTestSchema = z.object({
  code: z.string().min(1),
  name: z.string().optional(),
});
export type OrderedTest = z.infer<typeof OrderedTestSchema>;

export const SpecimenSchema = z.object({
  id: z.string().optional(),
  accessionNumber: z.string().min(1),
  barcode: z.string().min(1),
  patientId: z.string().optional(),
  patient: PatientSchema.optional(),
  identityConfirmation: IdentityConfirmationSchema.optional(),
  specimenType: z.string().default("blood"),
  orderedTests: z.array(OrderedTestSchema).default([]),
  status: SpecimenStatusSchema.default("registered"),
  collectedAt: z.string().datetime().optional(),
  registeredAt: z.string().datetime().optional(),
});
export type Specimen = z.infer<typeof SpecimenSchema>;

export const RegisterSpecimenRequestSchema = z.object({
  accessionNumber: z.string().min(1).optional(),
  barcode: z.string().min(1).optional(),
  patientId: z.string().min(1),
  identityConfirmation: IdentityConfirmationSchema.optional(),
  orderedTests: z.array(OrderedTestSchema).optional(),
  printLabel: z.boolean().optional(),
});
export type RegisterSpecimenRequest = z.infer<
  typeof RegisterSpecimenRequestSchema
>;
export const CanonicalResultSchema = z.object({
  id: z.string().optional(),
  accessionNumber: z.string().min(1),
  barcode: z.string().min(1),
  analyzerId: AnalyzerIdSchema,
  testCode: z.string().min(1),
  testName: z.string().optional(),
  value: z.union([z.string(), z.number()]),
  units: z.string().optional(),
  referenceLow: z.number().optional(),
  referenceHigh: z.number().optional(),
  flag: ResultFlagSchema.default("unknown"),
  status: ClinicalResultStatusSchema.default("pending_review"),
  observedAt: z.string().datetime(),
  rawMessageId: z.string().optional(),
});
export type CanonicalResult = z.infer<typeof CanonicalResultSchema>;

export const OutboxEventTypeSchema = z.enum([
  "specimen.registered",
  "result.received",
  "result.batch",
  "instrument.status",
  "patient.provisional_created",
]);
export type OutboxEventType = z.infer<typeof OutboxEventTypeSchema>;

export const OutboxEventSchema = z.object({
  eventId: z.string().uuid(),
  type: OutboxEventTypeSchema,
  status: OutboxStatusSchema.default("pending"),
  sequence: z.number().int().nonnegative(),
  payload: z.record(z.unknown()),
  createdAt: z.string().datetime(),
  attempts: z.number().int().nonnegative().default(0),
  lastError: z.string().optional(),
});
export type OutboxEvent = z.infer<typeof OutboxEventSchema>;

export const SyncEventsRequestSchema = z.object({
  events: z.array(OutboxEventSchema).min(1),
  edgeNodeId: z.string().min(1),
});
export type SyncEventsRequest = z.infer<typeof SyncEventsRequestSchema>;

export const SyncEventsResponseSchema = z.object({
  ackedEventIds: z.array(z.string()),
  duplicateEventIds: z.array(z.string()).default([]),
});
export type SyncEventsResponse = z.infer<typeof SyncEventsResponseSchema>;

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  service: z.string(),
  timestamp: z.string().datetime(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
