import {
  buildPanelsWithMembers,
  expandSelections,
  type OrderSelection,
} from "@drax-lis/catalog";
import type { CatalogResponse } from "@drax-lis/contracts";

export function selectionsToOrderedTests(
  catalog: CatalogResponse,
  selections: OrderSelection[],
) {
  const panels = buildPanelsWithMembers(
    catalog.panels.map((p) => ({
      code: p.code,
      name: p.name,
      description: p.description ?? undefined,
      memberCodes: p.memberCodes,
    })),
    catalog.items.map((i) => ({
      code: i.code,
      name: i.name,
      category: i.category,
      specimenHint:
        (i.specimenHint as "serum" | "urine" | "blood") ?? undefined,
      fastingRequired: i.fastingRequired,
    })),
  );
  return expandSelections(selections, panels);
}
