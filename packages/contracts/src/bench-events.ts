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

export const BenchEventSchema = z.discriminatedUnion("type", [
  ResultsIngestedEventSchema,
  SpecimenRegisteredEventSchema,
]);
export type BenchEvent = z.infer<typeof BenchEventSchema>;
