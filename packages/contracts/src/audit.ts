import { z } from "zod";
import { StaffJobTitleSchema, ResultFlagSchema } from "./schemas";

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
  "result.manual_entered",
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
  "release_queue.accession_dismissed",
  "release_queue.cleared_released",
  // Edge-first staff auth + device management (see docs/EDGE_AUTH_AND_STAFF.md)
  "staff.created",
  "staff.updated",
  "staff.login",
  "staff.login_failed",
  "device.enrolled",
  "device.revoked",
  "device.reassigned",
  "device.login",
  "device.login_failed",
]);
export type ClinicalAuditEventType = z.infer<
  typeof ClinicalAuditEventTypeSchema
>;

/** Frozen at action time — who the device belonged to when the action happened. */
export const DeviceSnapshotSchema = z.object({
  deviceId: z.string().uuid(),
  deviceName: z.string(),
  ownerStaffId: z.string().uuid(),
  ownerFullName: z.string().nullable().optional(),
});
export type DeviceSnapshot = z.infer<typeof DeviceSnapshotSchema>;

export const SubmitResultsRequestSchema = z.object({
  accessionNumbers: z.array(z.string().min(1)).min(1).optional(),
  patientId: z.string().min(1).optional(),
});
export type SubmitResultsRequest = z.infer<typeof SubmitResultsRequestSchema>;

export const ManualResultEntrySchema = z.object({
  accessionNumber: z.string().min(1),
  testCode: z.string().min(1),
  value: z.string().min(1),
  units: z.string().optional(),
  flag: ResultFlagSchema.default("unknown"),
  referenceLow: z.number().optional(),
  referenceHigh: z.number().optional(),
  observedAt: z.string().datetime().optional(),
});
export type ManualResultEntry = z.infer<typeof ManualResultEntrySchema>;

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
