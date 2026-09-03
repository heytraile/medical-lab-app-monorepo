export function formatReferenceRange(
  low?: number | null,
  high?: number | null,
): string {
  if (low != null && high != null) return `${low} – ${high}`;
  if (low != null) return `≥ ${low}`;
  if (high != null) return `≤ ${high}`;
  return "—";
}

export function formatReportDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function formatDob(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      dateStyle: "medium",
    });
  } catch {
    return iso;
  }
}

export function flagLabel(flag: string): string {
  switch (flag) {
    case "high":
      return "H";
    case "low":
      return "L";
    case "critical_high":
      return "HH";
    case "critical_low":
      return "LL";
    case "normal":
      return "N";
    default:
      return flag.slice(0, 3).toUpperCase();
  }
}

export function reportFilename(mrn: string, ext: "pdf" | "json"): string {
  const safe = mrn.replace(/[^\w.-]+/g, "_") || "patient";
  const day = new Date().toISOString().slice(0, 10);
  return `${safe}-${day}-report.${ext}`;
}
