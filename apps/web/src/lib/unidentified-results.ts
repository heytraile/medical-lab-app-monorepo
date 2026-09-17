import type { UnidentifiedAnalytePreview } from "@drax-lis/contracts";

export function formatUnidentifiedAnalytes(
  items: UnidentifiedAnalytePreview[],
): string {
  if (!items.length) return "results";
  return items
    .map((item) => {
      const units = item.units ? ` ${item.units}` : "";
      return `${item.testCode} ${item.value}${units}`.trim();
    })
    .join(" / ");
}

export function formatUnidentifiedResultBody(input: {
  analyzerLabel: string;
  items: UnidentifiedAnalytePreview[];
}): string {
  const reported = formatUnidentifiedAnalytes(input.items);
  return `${input.analyzerLabel} reported ${reported} with no specimen ID. Re-run the sample on the instrument with the tube label scanned or entered. Do not assign in LIS.`;
}
