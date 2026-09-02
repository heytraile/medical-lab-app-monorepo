import { useQuery } from "@tanstack/react-query";
import {
  CATALOG_CATEGORIES,
  DRAX_HALL_LAB,
  DHMS_CATALOG_ITEMS,
  buildPanelsWithMembers,
} from "@drax-lis/catalog";
import type { CatalogResponse } from "@drax-lis/contracts";
import { api } from "./api";

function localCatalog(): CatalogResponse {
  const panels = buildPanelsWithMembers();
  return {
    labId: DRAX_HALL_LAB.id,
    labName: DRAX_HALL_LAB.name,
    categories: [...CATALOG_CATEGORIES],
    items: DHMS_CATALOG_ITEMS.map((i) => ({
      code: i.code,
      name: i.name,
      category: i.category,
      specimenHint: i.specimenHint ?? null,
      fastingRequired: i.fastingRequired ?? false,
    })),
    panels: panels.map((p) => ({
      code: p.code,
      name: p.name,
      description: p.description ?? null,
      memberCodes: p.memberCodes,
      members: p.members.map((m) => ({
        code: m.code,
        name: m.name,
        category: m.category,
        specimenHint: m.specimenHint ?? null,
        fastingRequired: m.fastingRequired ?? false,
      })),
    })),
  };
}

export function useCatalog() {
  return useQuery({
    queryKey: ["catalog"],
    queryFn: async () => {
      try {
        return await api.getCatalog();
      } catch {
        return localCatalog();
      }
    },
    staleTime: 60_000,
    initialData: localCatalog(),
  });
}
