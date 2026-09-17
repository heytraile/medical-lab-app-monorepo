import { z } from "zod";
import { AnalyzerIdSchema, ResultFlagSchema } from "./schemas";

export const BenchIngestItemKindSchema = z.enum(["created", "escalated"]);
export type BenchIngestItemKind = z.infer<typeof BenchIngestItemKindSchema>;

export const BenchIngestItemSchema = z.object({
  id: z.string(),
  testCode: z.string(),
  testName: z.string().nullable().optional(),
  value: z.string(),
  units: z.string().nullable().optional(),
  flag: ResultFlagSchema.or(z.string()),
  status: z.string(),
  kind: BenchIngestItemKindSchema,
});
export type BenchIngestItem = z.infer<typeof BenchIngestItemSchema>;

export const ResultsIngestedEventSchema = z.object({
  type: z.literal("results.ingested"),
  at: z.string().datetime(),
  accessionNumber: z.string(),
  barcode: z.string(),
  analyzerId: AnalyzerIdSchema.or(z.string()),
  patientDisplayName: z.string().optional(),
  items: z.array(BenchIngestItemSchema),
});
export type ResultsIngestedEvent = z.infer<typeof ResultsIngestedEventSchema>;

export const SpecimenRegisteredEventSchema = z.object({
  type: z.literal("specimen.registered"),
  at: z.string().datetime(),
  accessionNumber: z.string(),
  barcode: z.string(),
  patientName: z.string().optional(),
});
export type SpecimenRegisteredEvent = z.infer<
  typeof SpecimenRegisteredEventSchema
>;

export const UnidentifiedReasonSchema = z.literal("missing_specimen_id");
export type UnidentifiedReason = z.infer<typeof UnidentifiedReasonSchema>;

export const UnidentifiedAnalytePreviewSchema = z.object({
  testCode: z.string(),
  value: z.string(),
  units: z.string().nullable().optional(),
  flag: z.string().optional(),
});
export type UnidentifiedAnalytePreview = z.infer<
  typeof UnidentifiedAnalytePreviewSchema
>;

export const ResultsUnidentifiedEventSchema = z.object({
  type: z.literal("results.unidentified"),
  at: z.string().datetime(),
  analyzerId: AnalyzerIdSchema.or(z.string()),
  rawMessageId: z.string(),
  reason: UnidentifiedReasonSchema,
  items: z.array(UnidentifiedAnalytePreviewSchema),
});
export type ResultsUnidentifiedEvent = z.infer<
  typeof ResultsUnidentifiedEventSchema
>;

export const UnidentifiedAcknowledgeReasonSchema = z.enum([
  "rerun_completed",
  "discarded_not_reportable",
]);
export type UnidentifiedAcknowledgeReason = z.infer<
  typeof UnidentifiedAcknowledgeReasonSchema
>;

export const AcknowledgeUnidentifiedRequestSchema = z.object({
  reason: UnidentifiedAcknowledgeReasonSchema,
});
export type AcknowledgeUnidentifiedRequest = z.infer<
  typeof AcknowledgeUnidentifiedRequestSchema
>;

export const UnidentifiedRawMessageSchema = z.object({
  id: z.string(),
  analyzerId: z.string(),
  receivedAt: z.string(),
  identificationStatus: UnidentifiedReasonSchema,
  items: z.array(UnidentifiedAnalytePreviewSchema),
});
export type UnidentifiedRawMessage = z.infer<
  typeof UnidentifiedRawMessageSchema
>;

export const BenchEventSchema = z.discriminatedUnion("type", [
  ResultsIngestedEventSchema,
  SpecimenRegisteredEventSchema,
  ResultsUnidentifiedEventSchema,
]);
export type BenchEvent = z.infer<typeof BenchEventSchema>;
