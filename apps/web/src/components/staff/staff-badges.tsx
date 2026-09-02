import type { StaffJobTitle, StaffRole } from "@drax-lis/contracts";
import { JOB_TITLE_LABELS, ROLE_LABELS } from "./staff-labels";

export function StaffJobTitleBadge({ title }: { title: StaffJobTitle | null }) {
  if (!title) return <span className="text-muted-foreground">—</span>;
  return <span>{JOB_TITLE_LABELS[title]}</span>;
}

export function StaffRoleBadge({ role }: { role: StaffRole }) {
  return <span className="capitalize">{ROLE_LABELS[role]}</span>;
}
