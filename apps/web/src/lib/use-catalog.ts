import { useQuery } from "@tanstack/react-query";
import {
  DRAX_HALL_LAB,
  DRAX_HALL_ROUTING_POLICY,
  DHMS_CATALOG_ITEMS,
  buildPanelsWithMembers,
  catalogPolicyFields,
} from "@drax-lis/catalog";
import type { CatalogResponse } from "@drax-lis/contracts";
import { api } from "./api";

function localCatalog(): CatalogResponse {
  const panels = buildPanelsWithMembers();
  const policyFields = catalogPolicyFields(DRAX_HALL_ROUTING_POLICY);
  return {
    labId: DRAX_HALL_LAB.id,
    labName: DRAX_HALL_LAB.name,
    ...policyFields,
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
  const query = useQuery({
    queryKey: ["catalog"],
    queryFn: () => api.getCatalog(),
    staleTime: 60_000,
    placeholderData: localCatalog(),
    retry: 1,
  });
  return {
    ...query,
    data: query.data ?? localCatalog(),
    usingOfflineFallback: query.isError,
  };
}
