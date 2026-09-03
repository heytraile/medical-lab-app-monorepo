import type { StaffJobTitle } from "@drax-lis/contracts";

export const JOB_TITLE_LABELS: Record<StaffJobTitle, string> = {
  phlebotomist: "Phlebotomist",
  lab_technologist: "Lab Technologist",
  receptionist: "Receptionist",
  physician: "Physician",
  admin_staff: "Admin Staff",
  other: "Other",
};

export function formatJobTitle(title: StaffJobTitle | null | undefined): string {
  if (!title) return "Staff";
  return JOB_TITLE_LABELS[title] ?? title;
}

/** Last 8 hex chars of staff account id — shown in outbound email, not the full UUID. */
export function staffSenderReference(staffId: string): string {
  return staffId.replace(/-/g, "").slice(-8).toUpperCase();
}

export const DEV_ROLE_JOB_TITLES: Record<
  "tech" | "authorizer" | "admin",
  StaffJobTitle
> = {
  tech: "lab_technologist",
  authorizer: "physician",
  admin: "admin_staff",
};
