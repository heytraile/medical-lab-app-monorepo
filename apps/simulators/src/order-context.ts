const EDGE_HOST = process.env.EDGE_HOST ?? "127.0.0.1";
const EDGE_PORT = Number(process.env.EDGE_ENGINE_PORT ?? 3101);
const SIM_STRICT =
  process.env.SIM_STRICT === "1" || process.env.SIM_STRICT === "true";

type SpecimenRow = {
  accessionNumber: string;
  barcode?: string;
  specimenNumber?: string;
  orderedTestsJson?: string;
};

type AccessionLookup = {
  accessionNumber: string;
  orderedTestsJson?: string;
  containers?: Array<{
    barcode?: string;
    specimenNumber?: string;
    orderedTestsJson?: string;
  }>;
};

export function isSimStrict(): boolean {
  return SIM_STRICT;
}

function parseOrderedCodes(json: string | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as Array<{ code?: string }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((t) => t.code?.trim().toUpperCase())
      .filter((code): code is string => Boolean(code));
  } catch {
    return [];
  }
}

async function fetchLookup(
  barcode: string,
): Promise<AccessionLookup | SpecimenRow | null> {
  const trimmed = barcode.trim();
  if (!trimmed) return null;

  const base = `http://${EDGE_HOST}:${EDGE_PORT}`;
  const urls = [
    `${base}/specimens?barcode=${encodeURIComponent(trimmed)}`,
    `${base}/specimens?accession=${encodeURIComponent(trimmed)}`,
    `${base}/specimens`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) continue;
      const data = (await res.json()) as
        | AccessionLookup
        | SpecimenRow
        | SpecimenRow[];
      if (Array.isArray(data)) {
        const row = data.find(
          (s) =>
            s.accessionNumber.toUpperCase() === trimmed.toUpperCase() ||
            s.accessionNumber === trimmed ||
            s.barcode?.toUpperCase() === trimmed.toUpperCase() ||
            s.specimenNumber?.toUpperCase() === trimmed.toUpperCase(),
        );
        return row ?? null;
      }
      return data;
    } catch {
      /* try next url */
    }
  }

  return null;
}

export async function fetchOrderedCatalogCodes(
  barcode: string,
): Promise<string[]> {
  const trimmed = barcode.trim();
  if (!trimmed) return [];

  const lookup = await fetchLookup(trimmed);
  if (!lookup) return [];

  if ("containers" in lookup && Array.isArray(lookup.containers)) {
    const matched =
      lookup.containers.find(
        (c) =>
          c.barcode?.toUpperCase() === trimmed.toUpperCase() ||
          c.specimenNumber?.toUpperCase() === trimmed.toUpperCase(),
      ) ?? lookup.containers[0];
    const fromContainer = parseOrderedCodes(matched?.orderedTestsJson);
    if (fromContainer.length) return fromContainer;
    return parseOrderedCodes(lookup.orderedTestsJson);
  }

  return parseOrderedCodes(lookup.orderedTestsJson);
}

export async function resolveOrderForBarcode(
  barcode: string,
): Promise<string[]> {
  const ordered = await fetchOrderedCatalogCodes(barcode);
  if (ordered.length > 0) return ordered;
  if (SIM_STRICT) return [];
  return [];
}
