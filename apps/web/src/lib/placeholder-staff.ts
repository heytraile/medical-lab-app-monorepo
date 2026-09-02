import type { StaffCollector, StaffMember } from "@drax-lis/contracts";

const COLLECTOR_JOB_TITLES = new Set<StaffCollector["jobTitle"]>([
  "phlebotomist",
  "lab_technologist",
]);

function toCollectors(staff: StaffMember[]): StaffCollector[] {
  return staff
    .filter(
      (s): s is StaffMember & { jobTitle: StaffCollector["jobTitle"] } =>
        Boolean(s.jobTitle && COLLECTOR_JOB_TITLES.has(s.jobTitle)),
    )
    .map((s) => ({
      id: s.id,
      fullName: s.fullName ?? s.email ?? "Staff",
      jobTitle: s.jobTitle,
    }));
}

/** Demo roster shown when the cloud staff API is unreachable. */
export const PLACEHOLDER_STAFF: StaffMember[] = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    email: "admin@draxhall.local",
    fullName: "Sam Admin",
    role: "admin",
    jobTitle: "admin_staff",
    isActive: true,
  },
  {
    id: "11111111-1111-4111-8111-111111111111",
    email: "authorizer@draxhall.local",
    fullName: "Dr. Alicia Bennett",
    role: "authorizer",
    jobTitle: "physician",
    isActive: true,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    email: "tech@draxhall.local",
    fullName: "Marlon Reid",
    role: "tech",
    jobTitle: "phlebotomist",
    isActive: true,
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    email: "phleb@draxhall.local",
    fullName: "Jordan Blake",
    role: "tech",
    jobTitle: "lab_technologist",
    isActive: true,
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    email: "karen@draxhall.local",
    fullName: "Karen Sinclair",
    role: "tech",
    jobTitle: "phlebotomist",
    isActive: true,
  },
  {
    id: "66666666-6666-4666-8666-666666666666",
    email: "reception@draxhall.local",
    fullName: "Tanya Clarke",
    role: "tech",
    jobTitle: "receptionist",
    isActive: true,
  },
  {
    id: "77777777-7777-4777-8777-777777777777",
    email: "labtech@draxhall.local",
    fullName: "Devon Matthews",
    role: "tech",
    jobTitle: "lab_technologist",
    isActive: true,
  },
];

export const PLACEHOLDER_COLLECTORS = toCollectors(PLACEHOLDER_STAFF);
