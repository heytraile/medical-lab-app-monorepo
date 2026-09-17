/** Jaccard similarity of two ordered-test code sets (0–1). */
export function jaccardSimilarity(a: Iterable<string>, b: Iterable<string>): number {
  const left = new Set(
    [...a].map((c) => c.trim().toUpperCase()).filter(Boolean),
  );
  const right = new Set(
    [...b].map((c) => c.trim().toUpperCase()).filter(Boolean),
  );
  if (left.size === 0 && right.size === 0) return 1;
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const code of left) {
    if (right.has(code)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** True when two orders look like the same encounter entered twice. */
export function isSimilarOrder(
  a: Iterable<string>,
  b: Iterable<string>,
  threshold = 0.8,
): boolean {
  return jaccardSimilarity(a, b) >= threshold;
}

export function orderedCodesFromTests(
  tests: Array<{ code?: string } | string>,
): string[] {
  return tests
    .map((t) => (typeof t === "string" ? t : t.code ?? ""))
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}
