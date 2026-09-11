/** Master-detail list: re-click the active row to clear selection. */
export function toggleSelection<T>(
  current: T | null,
  next: T,
  equals: (a: T, b: T) => boolean = (a, b) => a === b,
): T | null {
  return current !== null && equals(current, next) ? null : next;
}

export function equalsAccession(a: string, b: string): boolean {
  return a.toUpperCase() === b.toUpperCase();
}
