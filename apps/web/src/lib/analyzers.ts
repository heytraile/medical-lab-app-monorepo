export const ANALYZER_LABELS: Record<string, string> = {
  sysmex_xs1000i: "Sysmex XS-1000i",
  diamond_prolyte: "Diamond ProLyte",
  mindray_bs240: "Mindray BS-240",
  yhlo_iflash1200: "YHLO iFlash 1200",
  manual: "Manual entry",
};

export function analyzerLabel(id: string): string {
  return ANALYZER_LABELS[id] ?? id;
}
