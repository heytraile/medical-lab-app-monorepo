import { z } from "zod";
import { StaffJobTitleSchema } from "./schemas";

export const ProfileRoleSchema = z.enum(["tech", "authorizer", "admin"]);
export type ProfileRole = z.infer<typeof ProfileRoleSchema>;

export const ActorSnapshotSchema = z.object({
  userId: z.string(),
  email: z.string().nullable().optional(),
  fullName: z.string().nullable().optional(),
  role: ProfileRoleSchema,
  jobTitle: StaffJobTitleSchema.nullable().optional(),
  labId: z.string().uuid().optional().nullable(),
});
export type ActorSnapshot = z.infer<typeof ActorSnapshotSchema>;

export const ClinicalAuditEventTypeSchema = z.enum([
  "specimen.registered",
  "result.ingested",
  "result.submitted_for_release",
  "result.released",
  "result.accession_released",
  "result.accession_recalled",
  "result.accession_rejected",
  "result.value_updated",
  "report.exported",
  "report.emailed",
  "review_request.created",
  "review_request.acknowledged",
]);
export type ClinicalAuditEventType = z.infer<
  typeof ClinicalAuditEventTypeSchema
>;

export const SubmitResultsRequestSchema = z.object({
  accessionNumbers: z.array(z.string().min(1)).min(1).optional(),
  patientId: z.string().min(1).optional(),
});
export type SubmitResultsRequest = z.infer<typeof SubmitResultsRequestSchema>;

export const ReleaseAccessionRequestSchema = z.object({
  accessionNumber: z.string().min(1),
});
export type ReleaseAccessionRequest = z.infer<
  typeof ReleaseAccessionRequestSchema
>;

export const ReleaseAccessionResponseSchema = z.object({
  accessionNumber: z.string(),
  releasedCount: z.number().int().nonnegative(),
  resultIds: z.array(z.string()),
});
export type ReleaseAccessionResponse = z.infer<
  typeof ReleaseAccessionResponseSchema
>;

export const RecallAccessionRequestSchema = z.object({
  accessionNumbers: z.array(z.string().min(1)).min(1),
  reason: z.string().max(2000).optional(),
});
export type RecallAccessionRequest = z.infer<
  typeof RecallAccessionRequestSchema
>;

export const RecallAccessionResponseSchema = z.object({
  recalled: z.number().int().nonnegative(),
  accessionNumbers: z.array(z.string()),
});
export type RecallAccessionResponse = z.infer<
  typeof RecallAccessionResponseSchema
>;

export const ReportEmailRecipientTypeSchema = z.enum(["doctor", "patient"]);
export type ReportEmailRecipientType = z.infer<
  typeof ReportEmailRecipientTypeSchema
>;

export const EmailPatientReportRequestSchema = z.object({
  to: z.string().email(),
  recipientType: ReportEmailRecipientTypeSchema,
  pageSize: z.enum(["letter", "legal"]).optional(),
  message: z.string().max(2000).optional(),
});
export type EmailPatientReportRequest = z.infer<
  typeof EmailPatientReportRequestSchema
>;
