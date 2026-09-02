import type { StaffJobTitle, StaffRole } from "@drax-lis/contracts";

export const JOB_TITLE_LABELS: Record<StaffJobTitle, string> = {
  phlebotomist: "Phlebotomist",
  lab_technologist: "Lab Technologist",
  receptionist: "Receptionist",
  physician: "Physician",
  admin_staff: "Admin Staff",
  other: "Other",
};

export const ROLE_LABELS: Record<StaffRole, string> = {
  tech: "Tech",
  authorizer: "Authorizer",
  admin: "Admin",
};

export const JOB_TITLE_OPTIONS: StaffJobTitle[] = [
  "phlebotomist",
  "lab_technologist",
  "receptionist",
  "physician",
  "admin_staff",
  "other",
];

export const ROLE_OPTIONS: StaffRole[] = ["tech", "authorizer", "admin"];
