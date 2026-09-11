/** Plain-language labels for patient registry fields (Patients UI). */

export function chartStatusLabel(status: string | undefined): string {
  switch (status) {
    case "active":
      return "Active";
    case "inactive":
      return "Inactive";
    case "quarantined":
      return "Quarantined";
    default:
      return status ?? "—";
  }
}

export function chartStatusVariant(
  status: string | undefined,
): "muted" | "danger" | "warn" {
  if (status === "quarantined") return "danger";
  if (status === "inactive") return "warn";
  return "muted";
}

export function registrationSourceLabel(origin: string | undefined): string {
  if (origin === "local_provisional") return "Registered at this lab";
  if (origin === "upstream") return "Main hospital registry";
  return origin ?? "—";
}

export function hospitalRegistryLinkLabel(syncStatus: string | undefined): string {
  switch (syncStatus) {
    case "pending_upstream":
      return "Waiting to link";
    case "synced":
      return "Linked";
    case "failed":
      return "Could not link";
    case "n_a":
      return "Not applicable";
    default:
      return syncStatus ?? "—";
  }
}

export const CHART_STATUS_HELP =
  "Active charts can receive new specimens. Quarantined charts are blocked due to an identity conflict. Inactive charts were deactivated by an admin.";

export const REGISTRATION_SOURCE_HELP =
  "Whether this chart was imported from the main hospital registry or created here with a provisional TEMP MRN.";

export const HOSPITAL_REGISTRY_LINK_HELP =
  "For lab-registered charts: whether the chart has been linked to the main hospital patient system.";

export const HOSPITAL_SYSTEM_ID_HELP =
  "Identifier from the main hospital patient registry, if known. This is not the lab MRN.";
