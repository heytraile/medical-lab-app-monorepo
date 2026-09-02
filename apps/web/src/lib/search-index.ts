import type { AnalyzerStatus, BenchResult, SpecimenRow } from "../lib/api";
import { analyzerLabel } from "../lib/analyzers";

export type SearchHitKind = "nav" | "machine" | "specimen" | "result";

export type SearchHit = {
  id: string;
  kind: SearchHitKind;
  title: string;
  subtitle?: string;
  /** Pre-normalized haystack for fast includes() */
  haystack: string;
  href: string;
};

const NAV_HITS: SearchHit[] = [
  {
    id: "nav-bench",
    kind: "nav",
    title: "Bench Review",
    subtitle: "Live results",
    haystack: "bench review results live",
    href: "/bench",
  },
  {
    id: "nav-accession",
    kind: "nav",
    title: "Accession",
    subtitle: "Order tests & print label",
    haystack: "accession specimen order tests print label patient",
    href: "/accession",
  },
  {
    id: "nav-labels",
    kind: "nav",
    title: "Labels",
    subtitle: "Reprint & printer status",
    haystack: "labels reprint barcode zebra printer accession scan",
    href: "/labels",
  },
  {
    id: "nav-sync",
    kind: "nav",
    title: "Sync",
    subtitle: "Outbox status",
    haystack: "sync outbox cloud pending",
    href: "/sync",
  },
  {
    id: "nav-release",
    kind: "nav",
    title: "Release queue",
    subtitle: "Authorizer sign-off",
    haystack: "release authorize authorizer pending review cloud",
    href: "/release",
  },
  {
    id: "nav-patients",
    kind: "nav",
    title: "Patients",
    subtitle: "Local MRN registry",
    haystack: "patients registry mrn identity demographics",
    href: "/patients",
  },
  {
    id: "nav-staff",
    kind: "nav",
    title: "Staff",
    subtitle: "Register lab staff",
    haystack: "staff phlebotomist lab technologist admin registry",
    href: "/staff",
  },
  {
    id: "nav-profile",
    kind: "nav",
    title: "Profile",
    subtitle: "Your name and role",
    haystack: "profile account name role sign in staff",
    href: "/profile",
  },
  {
    id: "nav-login",
    kind: "nav",
    title: "Sign in",
    subtitle: "Staff login",
    haystack: "login sign in logout auth account",
    href: "/login",
  },
];

function patientSnippet(patientJson: string | null): string {
  if (!patientJson) return "";
  try {
    const p = JSON.parse(patientJson) as {
      firstName?: string;
      lastName?: string;
    };
    return [p.firstName, p.lastName].filter(Boolean).join(" ");
  } catch {
    return "";
  }
}

/** Build once when Query cache data changes — keystroke path only filters. */
export function buildSearchIndex(input: {
  analyzers: AnalyzerStatus[];
  results: BenchResult[];
  specimens: SpecimenRow[];
}): SearchHit[] {
  const hits: SearchHit[] = [...NAV_HITS];

  hits.push({
    id: "machine-all",
    kind: "machine",
    title: "All machines",
    subtitle: "Every analyzer",
    haystack: "all machines analyzers results",
    href: "/bench",
  });

  for (const a of input.analyzers) {
    const label = analyzerLabel(a.analyzerId);
    hits.push({
      id: `machine-${a.analyzerId}`,
      kind: "machine",
      title: label,
      subtitle: a.listening
        ? `Listening · ${a.lastAccession ?? "no accession yet"}`
        : "Offline",
      haystack: `${a.analyzerId} ${label} ${a.protocol} ${a.lastAccession ?? ""}`.toLowerCase(),
      href: `/bench?analyzer=${encodeURIComponent(a.analyzerId)}`,
    });
  }

  for (const s of input.specimens) {
    const patient = patientSnippet(s.patientJson);
    hits.push({
      id: `specimen-${s.id}`,
      kind: "specimen",
      title: s.accessionNumber,
      subtitle: patient || s.barcode,
      haystack:
        `${s.accessionNumber} ${s.barcode} ${patient} ${s.status}`.toLowerCase(),
      href: `/bench?q=${encodeURIComponent(s.accessionNumber)}`,
    });
  }

  // Dedupe results by accession+test for palette brevity
  const seen = new Set<string>();
  for (const r of input.results) {
    const key = `${r.accessionNumber}|${r.testCode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({
      id: `result-${r.id}`,
      kind: "result",
      title: `${r.testCode} · ${r.value}${r.units ? ` ${r.units}` : ""}`,
      subtitle: `${r.accessionNumber} · ${analyzerLabel(r.analyzerId)}`,
      haystack:
        `${r.accessionNumber} ${r.barcode} ${r.testCode} ${r.value} ${r.flag} ${r.analyzerId} ${analyzerLabel(r.analyzerId)}`.toLowerCase(),
      href: `/bench?analyzer=${encodeURIComponent(r.analyzerId)}&q=${encodeURIComponent(r.accessionNumber)}`,
    });
  }

  return hits;
}

const CAP: Record<SearchHitKind, number> = {
  nav: 8,
  machine: 8,
  specimen: 8,
  result: 8,
};

export function filterSearchIndex(
  index: SearchHit[],
  query: string,
): SearchHit[] {
  const q = query.trim().toLowerCase();
  const matched = !q
    ? index.filter((h) => h.kind === "nav" || h.kind === "machine")
    : index.filter((h) => h.haystack.includes(q));

  const counts: Record<SearchHitKind, number> = {
    nav: 0,
    machine: 0,
    specimen: 0,
    result: 0,
  };
  const out: SearchHit[] = [];
  for (const hit of matched) {
    if (counts[hit.kind] >= CAP[hit.kind]) continue;
    counts[hit.kind] += 1;
    out.push(hit);
  }
  return out;
}
