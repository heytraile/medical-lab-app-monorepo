import { z } from "zod";
import { ResultFlagSchema } from "./schemas";

export const LabReportBrandingSchema = z.object({
  name: z.string(),
  logoUrl: z.string().url().optional().nullable(),
  addressLines: z.array(z.string()).default([]),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  disclaimer: z.string().optional().nullable(),
});
export type LabReportBranding = z.infer<typeof LabReportBrandingSchema>;

export const PatientReportPatientSchema = z.object({
  mrn: z.string(),
  displayName: z.string(),
  dateOfBirth: z.string().nullable().optional(),
  sex: z.string().nullable().optional(),
});
export type PatientReportPatient = z.infer<typeof PatientReportPatientSchema>;

export const PatientReportOrderedTestSchema = z.object({
  code: z.string(),
  name: z.string().optional(),
});
export type PatientReportOrderedTest = z.infer<
  typeof PatientReportOrderedTestSchema
>;

export const PatientReportResultSchema = z.object({
  testCode: z.string(),
  testName: z.string().nullable().optional(),
  value: z.string(),
  units: z.string().nullable().optional(),
  referenceLow: z.number().nullable().optional(),
  referenceHigh: z.number().nullable().optional(),
  flag: ResultFlagSchema.or(z.string()),
  observedAt: z.string(),
  releasedAt: z.string().nullable().optional(),
});
export type PatientReportResult = z.infer<typeof PatientReportResultSchema>;

export const PatientReportAccessionSchema = z.object({
  accessionNumber: z.string(),
  barcode: z.string(),
  specimenType: z.string().optional(),
  registeredAt: z.string().optional(),
  orderedTests: z.array(PatientReportOrderedTestSchema).default([]),
  results: z.array(PatientReportResultSchema),
});
export type PatientReportAccession = z.infer<
  typeof PatientReportAccessionSchema
>;

export const PatientReportSummarySchema = z.object({
  accessionCount: z.number().int().nonnegative(),
  resultCount: z.number().int().nonnegative(),
});
export type PatientReportSummary = z.infer<typeof PatientReportSummarySchema>;

export const PatientReportPayloadSchema = z.object({
  generatedAt: z.string().datetime(),
  lab: LabReportBrandingSchema,
  patient: PatientReportPatientSchema,
  accessions: z.array(PatientReportAccessionSchema),
  summary: PatientReportSummarySchema,
});
export type PatientReportPayload = z.infer<typeof PatientReportPayloadSchema>;

export type ReportPageSize = "letter" | "legal";
