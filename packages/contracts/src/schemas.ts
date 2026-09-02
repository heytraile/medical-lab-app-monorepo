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
  /** Cloud requisition created at the counter before edge accession. */
  requisitionId: z.string().uuid().optional(),
  printLabel: z.boolean().optional(),
  copies: z.number().int().min(1).max(10).optional(),
  specimenType: z.string().optional(),
  collectedAt: z.string().datetime().optional(),
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

/**
 * A tech asking the authorizer to look at a patient's results.
 *
 * Identified by accession number rather than result id: the bench reads from
 * the edge database and this request is stored in the cloud one.
 */
export const ReviewRequestCreateSchema = z.object({
  accessionNumbers: z.array(z.string().min(1)).min(1),
  patientDisplayName: z.string().optional(),
  patientMrn: z.string().optional(),
  worstFlag: ResultFlagSchema.optional(),
  testCodes: z.array(z.string()).default([]),
  resultCount: z.number().int().nonnegative().default(0),
  note: z.string().max(500).optional(),
});
export type ReviewRequestCreate = z.infer<typeof ReviewRequestCreateSchema>;

export const ReviewRequestSchema = z.object({
  id: z.string(),
  accessionNumbers: z.array(z.string()),
  patientDisplayName: z.string().nullable().optional(),
  patientMrn: z.string().nullable().optional(),
  worstFlag: z.string().nullable().optional(),
  testCodes: z.array(z.string()).default([]),
  resultCount: z.number().int().nonnegative().default(0),
  note: z.string().nullable().optional(),
  requestedBy: z.string().nullable().optional(),
  requestedByEmail: z.string().nullable().optional(),
  requestedAt: z.string(),
  acknowledgedBy: z.string().nullable().optional(),
  acknowledgedAt: z.string().nullable().optional(),
});
export type ReviewRequest = z.infer<typeof ReviewRequestSchema>;

/** A panel or individual test ticked on the DHMS requisition form. */
export const OrderSelectionSchema = z.object({
  kind: z.enum(["panel", "test"]),
  code: z.string().min(1),
});
export type OrderSelection = z.infer<typeof OrderSelectionSchema>;

export const CatalogItemSchema = z.object({
  code: z.string(),
  name: z.string(),
  category: z.string(),
  specimenHint: z.string().nullable().optional(),
  fastingRequired: z.boolean().optional(),
});
export type CatalogItem = z.infer<typeof CatalogItemSchema>;

export const CatalogPanelSchema = z.object({
  code: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  memberCodes: z.array(z.string()),
  members: z.array(CatalogItemSchema).optional(),
});
export type CatalogPanel = z.infer<typeof CatalogPanelSchema>;

export const CatalogResponseSchema = z.object({
  labId: z.string(),
  labName: z.string(),
  categories: z.array(z.object({ id: z.string(), label: z.string() })),
  items: z.array(CatalogItemSchema),
  panels: z.array(CatalogPanelSchema),
});
export type CatalogResponse = z.infer<typeof CatalogResponseSchema>;

export const SpecimenTypeSchema = z.enum(["blood", "urine", "stool", "other"]);
export type SpecimenType = z.infer<typeof SpecimenTypeSchema>;

export const StaffJobTitleSchema = z.enum([
  "phlebotomist",
  "lab_technologist",
  "receptionist",
  "physician",
  "admin_staff",
  "other",
]);
export type StaffJobTitle = z.infer<typeof StaffJobTitleSchema>;

export const StaffRoleSchema = z.enum(["tech", "authorizer", "admin"]);
export type StaffRole = z.infer<typeof StaffRoleSchema>;

export const StaffMemberSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullable(),
  fullName: z.string().nullable(),
  role: StaffRoleSchema,
  jobTitle: StaffJobTitleSchema.nullable(),
  isActive: z.boolean(),
});
export type StaffMember = z.infer<typeof StaffMemberSchema>;

export const StaffMemberCreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1).max(200),
  role: StaffRoleSchema.default("tech"),
  jobTitle: StaffJobTitleSchema,
});
export type StaffMemberCreate = z.infer<typeof StaffMemberCreateSchema>;

export const StaffMemberUpdateSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  role: StaffRoleSchema.optional(),
  jobTitle: StaffJobTitleSchema.optional(),
  isActive: z.boolean().optional(),
});
export type StaffMemberUpdate = z.infer<typeof StaffMemberUpdateSchema>;

export const StaffCollectorSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  jobTitle: StaffJobTitleSchema,
});
export type StaffCollector = z.infer<typeof StaffCollectorSchema>;

export const SpecimenInfoSchema = z.object({
  specimenTypes: z.array(SpecimenTypeSchema).default([]),
  collectedAt: z.string().datetime().optional(),
  collectedByStaffId: z.string().uuid().optional(),
  collectedBy: z.string().max(200).optional(),
});
export type SpecimenInfo = z.infer<typeof SpecimenInfoSchema>;

export const RequisitionCreateSchema = z.object({
  patientId: z.string().optional(),
  patientSnapshot: z
    .object({
      displayName: z.string().optional(),
      mrn: z.string().optional(),
      dateOfBirth: z.string().nullable().optional(),
    })
    .optional(),
  referringPhysician: z.string().max(200).optional(),
  clinicalNotes: z.string().max(500).optional(),
  specimenInfo: SpecimenInfoSchema.optional(),
  selections: z.array(OrderSelectionSchema).min(1),
});
export type RequisitionCreate = z.infer<typeof RequisitionCreateSchema>;

export const RequisitionLinkSchema = z.object({
  accessionNumber: z.string().min(1),
  edgeSpecimenId: z.string().min(1),
});
export type RequisitionLink = z.infer<typeof RequisitionLinkSchema>;

export const LabRequisitionSchema = z.object({
  id: z.string(),
  labId: z.string(),
  patientId: z.string().nullable().optional(),
  patientSnapshot: z.record(z.unknown()).nullable().optional(),
  referringPhysician: z.string().nullable().optional(),
  clinicalNotes: z.string().nullable().optional(),
  specimenInfo: SpecimenInfoSchema.optional(),
  orderedSelections: z.array(OrderSelectionSchema),
  orderedTests: z.array(OrderedTestSchema),
  status: z.string(),
  accessionNumber: z.string().nullable().optional(),
  edgeSpecimenId: z.string().nullable().optional(),
  createdBy: z.string().nullable().optional(),
  createdAt: z.string(),
  fastingRequired: z.boolean().optional(),
});
export type LabRequisition = z.infer<typeof LabRequisitionSchema>;

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  service: z.string(),
  timestamp: z.string().datetime(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
