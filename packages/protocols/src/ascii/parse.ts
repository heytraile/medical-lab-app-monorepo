/**
 * Simple ASCII delimited line parser (generic).
 * ProLyte uses multi-line labeled blocks via `parseProlyteBlock`.
 */
export function parseAsciiDelimited(
  line: string,
  delimiter = "|",
): string[] {
  return line.trim().split(delimiter);
}
