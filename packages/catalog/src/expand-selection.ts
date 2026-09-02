import {
  DHMS_CATALOG_ITEMS,
  DHMS_PANELS,
  type CatalogItemSeed,
  type PanelSeed,
} from "./dhms-catalog";

export type CatalogItem = CatalogItemSeed & { id?: string };

export type PanelWithMembers = PanelSeed & {
  id?: string;
  members: CatalogItem[];
};

export type OrderSelection =
  | { kind: "panel"; code: string }
  | { kind: "test"; code: string };

export type ExpandedOrderedTest = {
  code: string;
  name: string;
  sourcePanel?: string;
  fastingRequired?: boolean;
  specimenHint?: string;
};

function norm(code: string): string {
  return code.trim().toUpperCase();
}

export function buildCatalogMaps(items: CatalogItemSeed[] = DHMS_CATALOG_ITEMS) {
  const byCode = new Map<string, CatalogItemSeed>();
  for (const item of items) {
    byCode.set(norm(item.code), item);
  }
  return byCode;
}

export function buildPanelsWithMembers(
  panels: PanelSeed[] = DHMS_PANELS,
  items: CatalogItemSeed[] = DHMS_CATALOG_ITEMS,
): PanelWithMembers[] {
  const byCode = buildCatalogMaps(items);
  return panels.map((panel) => ({
    ...panel,
    members: panel.memberCodes
      .map((code) => byCode.get(norm(code)))
      .filter((m): m is CatalogItemSeed => Boolean(m)),
  }));
}

/**
 * Expand panel + individual selections into a deduplicated ordered test list.
 * Deselecting a panel is handled by the UI removing the panel from selections;
 * this function only expands the current selection set.
 */
export function expandSelections(
  selections: OrderSelection[],
  panels: PanelWithMembers[] = buildPanelsWithMembers(),
  items: CatalogItemSeed[] = DHMS_CATALOG_ITEMS,
): ExpandedOrderedTest[] {
  const itemByCode = buildCatalogMaps(items);
  const panelByCode = new Map(panels.map((p) => [norm(p.code), p]));
  const out = new Map<string, ExpandedOrderedTest>();

  const addTest = (
    code: string,
    sourcePanel?: string,
  ) => {
    const key = norm(code);
    const item = itemByCode.get(key);
    if (!item) return;
    const existing = out.get(key);
    if (existing) {
      if (!existing.sourcePanel && sourcePanel) {
        out.set(key, { ...existing, sourcePanel });
      }
      return;
    }
    out.set(key, {
      code: item.code,
      name: item.name,
      sourcePanel,
      fastingRequired: item.fastingRequired,
      specimenHint: item.specimenHint,
    });
  };

  for (const sel of selections) {
    if (sel.kind === "test") {
      addTest(sel.code);
      continue;
    }
    const panel = panelByCode.get(norm(sel.code));
    if (!panel) continue;
    for (const member of panel.members) {
      addTest(member.code, panel.name);
    }
  }

  return [...out.values()];
}

export function selectionsNeedFasting(
  expanded: ExpandedOrderedTest[],
  panels: PanelWithMembers[] = buildPanelsWithMembers(),
  selections: OrderSelection[] = [],
): boolean {
  if (expanded.some((t) => t.fastingRequired)) return true;
  const panelCodes = new Set(
    selections.filter((s) => s.kind === "panel").map((s) => norm(s.code)),
  );
  return panels.some(
    (p) =>
      panelCodes.has(norm(p.code)) &&
      (p.code === "HYPERTENSION" ||
        p.description?.toLowerCase().includes("fasting")),
  );
}
