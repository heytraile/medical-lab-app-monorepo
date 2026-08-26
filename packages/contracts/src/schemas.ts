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
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sex: z.enum(["M", "F", "O", "U"]).optional(),
});
export type Patient = z.infer<typeof PatientSchema>;

export const OrderedTestSchema = z.object({
  code: z.string().min(1),
  name: z.string().optional(),
});
export type OrderedTest = z.infer<typeof OrderedTestSchema>;

export const SpecimenSchema = z.object({
  id: z.string().optional(),
  accessionNumber: z.string().min(1),
  barcode: z.string().min(1),
  patient: PatientSchema.optional(),
  specimenType: z.string().default("blood"),
  orderedTests: z.array(OrderedTestSchema).default([]),
  status: SpecimenStatusSchema.default("registered"),
  collectedAt: z.string().datetime().optional(),
  registeredAt: z.string().datetime().optional(),
});
export type Specimen = z.infer<typeof SpecimenSchema>;

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
  observedAt: z.string().datetime(),
  rawMessageId: z.string().optional(),
});
export type CanonicalResult = z.infer<typeof CanonicalResultSchema>;

export const OutboxEventTypeSchema = z.enum([
  "specimen.registered",
  "result.received",
  "result.batch",
  "instrument.status",
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
