function humanizeManualComponentCode(code: string): string {
  return code
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Label for manual entry actions — disambiguates multi-component tests (e.g. urinalysis). */
export function manualEntryButtonLabel(options: {
  isEdit: boolean;
  resultComponentName?: string;
  resultComponentCode?: string;
  /** When more than one manual button is shown for the same ordered test. */
  siblingManualCount?: number;
}): string {
  const { isEdit, resultComponentName, resultComponentCode, siblingManualCount } =
    options;
  const prefix = isEdit ? "Edit" : "Enter";

  const namedComponent =
    resultComponentName && resultComponentName !== "Manual result"
      ? resultComponentName
      : null;
  const codedComponent =
    resultComponentCode && resultComponentCode !== "RESULT"
      ? humanizeManualComponentCode(resultComponentCode)
      : null;
  const multiple = (siblingManualCount ?? 1) > 1;

  const descriptor =
    namedComponent ??
    (codedComponent && (multiple || isEdit) ? codedComponent : null);

  if (descriptor) return `${prefix} ${descriptor}`;
  return isEdit ? "Edit result" : "Enter result";
}
