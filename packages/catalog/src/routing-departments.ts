import {
  CATALOG_CATEGORY_LABELS,
  CATALOG_CATEGORY_ORDER,
  categoryLabel,
  type CatalogCategory,
} from "./catalog-categories";
import {
  collectionTypeLabel,
  collectionTypeLabelShort,
  normalizeCollectionType,
  pickCollectionTypeForTests,
  type CollectionType,
} from "./collection-type";
import type { ExpandedOrderedTest } from "./expand-selection";

export type RoutingMode = "granular" | "consolidated";

export type RoutingDepartmentDef = {
  key: string;
  label: string;
  labelShort: string;
  categories: string[];
};

export type LabRoutingSettings = {
  mode: RoutingMode;
  splitByCollectionType: boolean;
  departments: RoutingDepartmentDef[];
};

export type ResolvedRoutingDepartment = {
  key: string;
  label: string;
  labelShort: string;
};

export type DepartmentLabelGroup = {
  departmentKey: string;
  departmentLabel: string;
  departmentLabelShort: string;
  collectionType: CollectionType;
  collectionLabel: string;
  collectionLabelShort: string;
  /** @deprecated Use collectionType — kept for API compat. */
  specimenType: CollectionType;
  tests: ExpandedOrderedTest[];
};

const GRANULAR_LABEL_SHORT: Record<CatalogCategory, string> = {
  haematology: "Hema",
  blood_chemistry: "Chem",
  cardiac_enzymes: "Card Enz",
  endocrinology: "Endo",
  immunology: "Immuno",
  anaemia: "Anemia",
  special_chemistry: "Sp Chem",
  urine_chemistry: "Ur Chem",
  bacteriology: "Micro B",
  faeces_misc: "Stool",
  drugs_of_abuse: "DOA",
  therapeutic_drug: "TDM",
};

export const ROUTING_PRESET_GRANULAR: LabRoutingSettings = {
  mode: "granular",
  splitByCollectionType: false,
  departments: CATALOG_CATEGORY_ORDER.map((key) => ({
    key,
    label: CATALOG_CATEGORY_LABELS[key],
    labelShort: GRANULAR_LABEL_SHORT[key],
    categories: [key],
  })),
};

export const ROUTING_PRESET_CONSOLIDATED_DHMS: LabRoutingSettings = {
  mode: "consolidated",
  splitByCollectionType: true,
  departments: [
    {
      key: "hematology",
      label: "Hematology",
      labelShort: "Hema",
      categories: ["haematology", "anaemia"],
    },
    {
      key: "chemistry",
      label: "Chemistry",
      labelShort: "Chem",
      categories: [
        "blood_chemistry",
        "cardiac_enzymes",
        "endocrinology",
        "immunology",
        "special_chemistry",
        "urine_chemistry",
        "drugs_of_abuse",
        "therapeutic_drug",
      ],
    },
    {
      key: "microbiology",
      label: "Microbiology",
      labelShort: "Micro B",
      categories: ["bacteriology", "faeces_misc"],
    },
  ],
};

/** Drax Hall install — consolidated routing for local/offline catalog. */
export const DRAX_HALL_ROUTING_SETTINGS = ROUTING_PRESET_CONSOLIDATED_DHMS;

export type LabRoutingScopeConfig = {
  mode: RoutingMode;
  splitByCollectionType?: boolean;
};

export type LabRoutingPolicy = {
  /** Rollup definition when a scope uses consolidated mode. */
  consolidated: LabRoutingSettings;
  accession: LabRoutingScopeConfig;
  labels: LabRoutingScopeConfig;
};

/** Drax Hall default: granular accession (form), consolidated labels. */
export const DRAX_HALL_ROUTING_POLICY: LabRoutingPolicy = {
  consolidated: ROUTING_PRESET_CONSOLIDATED_DHMS,
  accession: { mode: "granular" },
  labels: { mode: "consolidated", splitByCollectionType: true },
};

function normalizeScopeConfig(
  raw: unknown,
  fallback: LabRoutingScopeConfig,
): LabRoutingScopeConfig {
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Record<string, unknown>;
  const mode = o.mode === "consolidated" ? "consolidated" : "granular";
  return {
    mode,
    splitByCollectionType:
      o.splitByCollectionType !== undefined
        ? Boolean(o.splitByCollectionType)
        : fallback.splitByCollectionType,
  };
}

/** Parse labs.settings.routing — supports legacy single-settings shape. */
export function normalizeLabRoutingPolicy(raw: unknown): LabRoutingPolicy {
  if (!raw || typeof raw !== "object") return DRAX_HALL_ROUTING_POLICY;
  const o = raw as Record<string, unknown>;

  if ("accession" in o || "labels" in o || "consolidated" in o) {
    const consolidated = normalizeLabRoutingSettings(
      o.consolidated ?? ROUTING_PRESET_CONSOLIDATED_DHMS,
    );
    return {
      consolidated,
      accession: normalizeScopeConfig(o.accession, { mode: "granular" }),
      labels: normalizeScopeConfig(o.labels, {
        mode: "consolidated",
        splitByCollectionType: true,
      }),
    };
  }

  const legacy = normalizeLabRoutingSettings(raw);
  return {
    consolidated: legacy,
    accession: {
      mode: legacy.mode,
      splitByCollectionType: legacy.splitByCollectionType,
    },
    labels: {
      mode: legacy.mode,
      splitByCollectionType: legacy.splitByCollectionType,
    },
  };
}

export function resolveRoutingForScope(
  policy: LabRoutingPolicy,
  scope: "accession" | "labels",
): LabRoutingSettings {
  const scopeCfg = policy[scope];
  if (scopeCfg.mode === "consolidated") {
    const base = policy.consolidated;
    return {
      ...base,
      mode: "consolidated",
      splitByCollectionType:
        scopeCfg.splitByCollectionType ?? base.splitByCollectionType,
    };
  }
  return {
    ...ROUTING_PRESET_GRANULAR,
    splitByCollectionType: scopeCfg.splitByCollectionType ?? false,
  };
}

/** Always the 12 requisition form categories — never consolidated tabs. */
export function catalogCategoriesForUi(): Array<{ id: string; label: string }> {
  return CATALOG_CATEGORY_ORDER.map((key) => ({
    id: key,
    label: CATALOG_CATEGORY_LABELS[key],
  }));
}

export function catalogPolicyFields(policy: LabRoutingPolicy): {
  routingPolicy: LabRoutingPolicy;
  accessionRouting: LabRoutingSettings;
  labelRouting: LabRoutingSettings;
  routing: LabRoutingSettings;
  routingDepartments: Array<{ id: string; label: string; labelShort: string }>;
  catalogCategories: Array<{ id: string; label: string }>;
  categories: Array<{ id: string; label: string }>;
} {
  const accessionRouting = resolveRoutingForScope(policy, "accession");
  const labelRouting = resolveRoutingForScope(policy, "labels");
  const catalogCategories = catalogCategoriesForUi();
  return {
    routingPolicy: policy,
    accessionRouting,
    labelRouting,
    routing: labelRouting,
    routingDepartments: labelRouting.departments.map((d) => ({
      id: d.key,
      label: d.label,
      labelShort: d.labelShort,
    })),
    catalogCategories,
    categories: catalogCategories,
  };
}

function categoryToDepartmentMap(
  config: LabRoutingSettings,
): Map<string, RoutingDepartmentDef> {
  const map = new Map<string, RoutingDepartmentDef>();
  for (const dept of config.departments) {
    for (const cat of dept.categories) {
      map.set(cat.trim(), dept);
    }
  }
  return map;
}

export function normalizeLabRoutingSettings(
  raw: unknown,
): LabRoutingSettings {
  if (!raw || typeof raw !== "object") return ROUTING_PRESET_GRANULAR;
  const o = raw as Record<string, unknown>;
  const mode = o.mode === "consolidated" ? "consolidated" : "granular";
  const splitByCollectionType =
    o.splitByCollectionType !== undefined
      ? Boolean(o.splitByCollectionType)
      : mode === "consolidated";
  const departmentsRaw = o.departments;
  if (!Array.isArray(departmentsRaw) || departmentsRaw.length === 0) {
    return mode === "consolidated"
      ? ROUTING_PRESET_CONSOLIDATED_DHMS
      : ROUTING_PRESET_GRANULAR;
  }
  const departments: RoutingDepartmentDef[] = [];
  for (const entry of departmentsRaw) {
    if (!entry || typeof entry !== "object") continue;
    const d = entry as Record<string, unknown>;
    const key = String(d.key ?? "").trim();
    const label = String(d.label ?? "").trim();
    const labelShort = String(d.labelShort ?? label).trim();
    const categories = Array.isArray(d.categories)
      ? d.categories.map((c) => String(c).trim()).filter(Boolean)
      : [];
    if (!key || !label || categories.length === 0) continue;
    departments.push({ key, label, labelShort, categories });
  }
  if (departments.length === 0) {
    return mode === "consolidated"
      ? ROUTING_PRESET_CONSOLIDATED_DHMS
      : ROUTING_PRESET_GRANULAR;
  }
  return { mode, splitByCollectionType, departments };
}

export function routingDepartmentsForUi(
  config: LabRoutingSettings,
): Array<{ id: string; label: string }> {
  return config.departments.map((d) => ({ id: d.key, label: d.label }));
}

export function catalogRoutingFields(config: LabRoutingSettings): {
  routing: LabRoutingSettings;
  routingDepartments: Array<{ id: string; label: string; labelShort: string }>;
  categories: Array<{ id: string; label: string }>;
} {
  return {
    routing: config,
    routingDepartments: config.departments.map((d) => ({
      id: d.key,
      label: d.label,
      labelShort: d.labelShort,
    })),
    categories: routingDepartmentsForUi(config),
  };
}

export function resolveRoutingDepartment(
  catalogCategory: string | undefined,
  config: LabRoutingSettings = ROUTING_PRESET_GRANULAR,
): ResolvedRoutingDepartment {
  const cat = catalogCategory?.trim() || "general";
  const map = categoryToDepartmentMap(config);
  const dept = map.get(cat);
  if (dept) {
    return {
      key: dept.key,
      label: dept.label,
      labelShort: dept.labelShort,
    };
  }
  const fallbackLabel = categoryLabel(cat);
  return {
    key: cat,
    label: fallbackLabel,
    labelShort: fallbackLabel.slice(0, 8),
  };
}

export function resolveRoutingDepartmentByKey(
  departmentKey: string,
  config: LabRoutingSettings = ROUTING_PRESET_GRANULAR,
): ResolvedRoutingDepartment {
  const key = departmentKey.trim();
  const dept = config.departments.find((d) => d.key === key);
  if (dept) {
    return {
      key: dept.key,
      label: dept.label,
      labelShort: dept.labelShort,
    };
  }
  return {
    key,
    label: categoryLabel(key),
    labelShort: categoryLabel(key).slice(0, 8),
  };
}

export function routingDepartmentSortIndex(
  departmentKey: string,
  config: LabRoutingSettings = ROUTING_PRESET_GRANULAR,
): number {
  const idx = config.departments.findIndex((d) => d.key === departmentKey);
  if (idx >= 0) return idx;
  const legacy = CATALOG_CATEGORY_ORDER.indexOf(
    departmentKey as CatalogCategory,
  );
  return legacy >= 0 ? legacy : 99;
}

function groupKey(
  routingKey: string,
  collectionType: CollectionType,
  config: LabRoutingSettings,
): string {
  if (!config.splitByCollectionType) return routingKey;
  return `${routingKey}:${collectionType}`;
}

/** Group expanded tests into lab routing labels (respects lab routing config). */
export function groupTestsByDepartment(
  tests: ExpandedOrderedTest[],
  config: LabRoutingSettings = ROUTING_PRESET_GRANULAR,
): DepartmentLabelGroup[] {
  const map = new Map<string, ExpandedOrderedTest[]>();
  const meta = new Map<
    string,
    {
      departmentKey: string;
      departmentLabel: string;
      departmentLabelShort: string;
      collectionType: CollectionType;
    }
  >();

  for (const test of tests) {
    const routing = resolveRoutingDepartment(test.category, config);
    const collectionType = normalizeCollectionType(test.specimenHint);
    const key = groupKey(routing.key, collectionType, config);
    const list = map.get(key) ?? [];
    list.push(test);
    map.set(key, list);
    if (!meta.has(key)) {
      meta.set(key, {
        departmentKey: routing.key,
        departmentLabel: routing.label,
        departmentLabelShort: routing.labelShort,
        collectionType,
      });
    }
  }

  const collectionOrder: CollectionType[] = [
    "blood",
    "urine",
    "stool",
    "other",
  ];

  const keys = [...map.keys()].sort((a, b) => {
    const ma = meta.get(a)!;
    const mb = meta.get(b)!;
    const ai = routingDepartmentSortIndex(ma.departmentKey, config);
    const bi = routingDepartmentSortIndex(mb.departmentKey, config);
    if (ai !== bi) return ai - bi;
    const ctA = collectionOrder.indexOf(ma.collectionType);
    const ctB = collectionOrder.indexOf(mb.collectionType);
    return ctA - ctB;
  });

  return keys.map((key) => {
    const groupTests = map.get(key)!;
    const m = meta.get(key)!;
    const collectionType =
      m.collectionType ??
      pickCollectionTypeForTests(groupTests.map((t) => t.specimenHint));
    return {
      departmentKey: m.departmentKey,
      departmentLabel: m.departmentLabel,
      departmentLabelShort: m.departmentLabelShort,
      collectionType,
      collectionLabel: collectionTypeLabel(collectionType),
      collectionLabelShort: collectionTypeLabelShort(collectionType),
      specimenType: collectionType,
      tests: groupTests,
    };
  });
}
