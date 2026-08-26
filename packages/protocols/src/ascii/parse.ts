/**
 * Simple ASCII delimited line parser (ProLyte-style).
 * Phase 1 will replace regex stubs with vendor-accurate field maps.
 */
export function parseAsciiDelimited(
  line: string,
  delimiter = "|",
): string[] {
  return line.trim().split(delimiter);
}
