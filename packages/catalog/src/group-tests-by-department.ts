import {
  CATALOG_CATEGORY_ORDER,
  categoryLabel,
  type CatalogCategory,
} from "./catalog-categories";
import {
  collectionTypeLabel,
  normalizeCollectionType,
  pickCollectionTypeForTests,
  type CollectionType,
} from "./collection-type";
import type { ExpandedOrderedTest } from "./expand-selection";

export type DepartmentLabelGroup = {
  departmentKey: CatalogCategory | string;
  departmentLabel: string;
  collectionType: CollectionType;
  collectionLabel: string;
  /** @deprecated Use collectionType — kept for API compat. */
  specimenType: CollectionType;
  tests: ExpandedOrderedTest[];
};

function departmentKeyFor(test: ExpandedOrderedTest): string {
  return test.category?.trim() || "general";
}

/** Group expanded tests into lab routing labels (one per requisition category). */
export function groupTestsByDepartment(
  tests: ExpandedOrderedTest[],
): DepartmentLabelGroup[] {
  const map = new Map<string, ExpandedOrderedTest[]>();
  for (const test of tests) {
    const key = departmentKeyFor(test);
    const list = map.get(key) ?? [];
    list.push(test);
    map.set(key, list);
  }

  const orderedKeys = [
    ...CATALOG_CATEGORY_ORDER.filter((k) => map.has(k)),
    ...[...map.keys()].filter(
      (k) => !CATALOG_CATEGORY_ORDER.includes(k as CatalogCategory),
    ),
  ];

  return orderedKeys.map((departmentKey) => {
    const groupTests = map.get(departmentKey)!;
    const collectionType = pickCollectionTypeForTests(
      groupTests.map((t) => t.specimenHint),
    );
    return {
      departmentKey,
      departmentLabel: categoryLabel(departmentKey),
      collectionType,
      collectionLabel: collectionTypeLabel(collectionType),
      specimenType: collectionType,
      tests: groupTests,
    };
  });
}
