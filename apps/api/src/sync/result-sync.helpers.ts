/** Do not overwrite cloud rows after clinical release. */
export function shouldApplyResultBatchUpdate(
  existingStatus: string | null | undefined,
): boolean {
  return existingStatus !== "released";
}
