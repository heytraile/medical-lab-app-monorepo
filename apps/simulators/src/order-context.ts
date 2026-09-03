const EDGE_HOST = process.env.EDGE_HOST ?? "127.0.0.1";
const EDGE_PORT = Number(process.env.EDGE_ENGINE_PORT ?? 3101);
const SIM_STRICT =
  process.env.SIM_STRICT === "1" || process.env.SIM_STRICT === "true";

type SpecimenRow = {
  accessionNumber: string;
  orderedTestsJson?: string;
};

export function isSimStrict(): boolean {
  return SIM_STRICT;
}

export async function fetchOrderedCatalogCodes(
  barcode: string,
): Promise<string[]> {
  const trimmed = barcode.trim();
  if (!trimmed) return [];

  const base = `http://${EDGE_HOST}:${EDGE_PORT}`;
  const urls = [
    `${base}/specimens?accession=${encodeURIComponent(trimmed)}`,
    `${base}/specimens`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) continue;
      const data = (await res.json()) as SpecimenRow | SpecimenRow[];
      const row = Array.isArray(data)
        ? data.find(
            (s) =>
              s.accessionNumber.toUpperCase() === trimmed.toUpperCase() ||
              s.accessionNumber === trimmed,
          )
        : data;
      if (!row?.orderedTestsJson) continue;
      const parsed = JSON.parse(row.orderedTestsJson) as Array<{ code?: string }>;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((t) => t.code?.trim().toUpperCase())
        .filter((code): code is string => Boolean(code));
    } catch {
      /* try next url */
    }
  }

  return [];
}

export async function resolveOrderForBarcode(
  barcode: string,
): Promise<string[]> {
  const ordered = await fetchOrderedCatalogCodes(barcode);
  if (ordered.length > 0) return ordered;
  if (SIM_STRICT) return [];
  return [];
}
