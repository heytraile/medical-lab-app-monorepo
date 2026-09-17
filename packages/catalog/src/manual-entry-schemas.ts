import { computeClinicalFlag } from "./reference-limits";
import { normalizeCode } from "./test-fulfillment";

export type ManualFieldType = "text" | "number" | "textarea" | "select";

export type ManualEntryField = {
  id: string;
  label: string;
  type: ManualFieldType;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  defaultUnits?: string;
  referenceLow?: number;
  referenceHigh?: number;
};

export type ManualEntrySchema = {
  fields: ManualEntryField[];
  displayTemplate?: string;
  hideFlag?: boolean;
  hideUnits?: boolean;
};

const BLOOD_TYPE_OPTIONS = [
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "AB", label: "AB" },
  { value: "O", label: "O" },
];

const RH_OPTIONS = [
  { value: "Positive", label: "Rh Positive" },
  { value: "Negative", label: "Rh Negative" },
];

const URINE_STRIP_OPTIONS = [
  { value: "Negative", label: "Negative" },
  { value: "Trace", label: "Trace" },
  { value: "1+", label: "1+" },
  { value: "2+", label: "2+" },
  { value: "3+", label: "3+" },
  { value: "4+", label: "4+" },
];

const FILM_REVIEW_OPTIONS = [
  { value: "No significant abnormality", label: "No significant abnormality" },
  { value: "Left shift", label: "Left shift" },
  { value: "Toxic granulation", label: "Toxic granulation" },
  { value: "Atypical lymphocytes", label: "Atypical lymphocytes" },
  { value: "Blasts present", label: "Blasts present" },
  { value: "Other", label: "Other (see comment)" },
];

const MANUAL_ENTRY_SCHEMAS: Record<string, ManualEntrySchema> = {
  "ESR:RESULT": {
    fields: [
      {
        id: "rate",
        label: "ESR",
        type: "number",
        required: true,
        placeholder: "e.g. 12",
        defaultUnits: "mm/hr",
        referenceLow: 0,
        referenceHigh: 20,
      },
    ],
    hideFlag: true,
    hideUnits: true,
  },
  "GROUP_RH:RESULT": {
    fields: [
      {
        id: "bloodType",
        label: "Blood group",
        type: "select",
        required: true,
        options: BLOOD_TYPE_OPTIONS,
      },
      {
        id: "rhFactor",
        label: "Rh factor",
        type: "select",
        required: true,
        options: RH_OPTIONS,
      },
    ],
    displayTemplate: "Group {bloodType}, Rh {rhFactor}",
    hideFlag: true,
    hideUnits: true,
  },
  "URINALYSIS_COMPLETE:CHEMISTRY": {
    fields: [
      {
        id: "appearance",
        label: "Appearance",
        type: "text",
        placeholder: "e.g. Clear, yellow",
      },
      {
        id: "protein",
        label: "Protein",
        type: "select",
        options: URINE_STRIP_OPTIONS,
      },
      {
        id: "glucose",
        label: "Glucose",
        type: "select",
        options: URINE_STRIP_OPTIONS,
      },
      {
        id: "ketones",
        label: "Ketones",
        type: "select",
        options: URINE_STRIP_OPTIONS,
      },
      {
        id: "blood",
        label: "Blood",
        type: "select",
        options: URINE_STRIP_OPTIONS,
      },
      {
        id: "leukocytes",
        label: "Leukocytes",
        type: "select",
        options: URINE_STRIP_OPTIONS,
      },
      {
        id: "nitrite",
        label: "Nitrite",
        type: "select",
        options: [
          { value: "Negative", label: "Negative" },
          { value: "Positive", label: "Positive" },
        ],
      },
      {
        id: "notes",
        label: "Additional chemistry notes",
        type: "textarea",
        placeholder: "Optional strip or dipstick observations",
      },
    ],
    hideFlag: true,
    hideUnits: true,
  },
  "URINALYSIS_COMPLETE:MICROSCOPY": {
    fields: [
      {
        id: "wbc",
        label: "WBC / hpf",
        type: "text",
        placeholder: "e.g. 0-2",
      },
      {
        id: "rbc",
        label: "RBC / hpf",
        type: "text",
        placeholder: "e.g. 0-1",
      },
      {
        id: "epithelial",
        label: "Epithelial cells",
        type: "text",
        placeholder: "e.g. Few",
      },
      {
        id: "bacteria",
        label: "Bacteria",
        type: "text",
        placeholder: "e.g. None seen",
      },
      {
        id: "casts",
        label: "Casts",
        type: "text",
        placeholder: "e.g. None",
      },
      {
        id: "crystals",
        label: "Crystals",
        type: "text",
        placeholder: "e.g. None",
      },
      {
        id: "notes",
        label: "Microscopy notes",
        type: "textarea",
        placeholder: "Other sediment findings",
      },
    ],
    hideFlag: true,
    hideUnits: true,
  },
  "WBC_DIFF:BLOOD_FILM_REVIEW": {
    fields: [
      {
        id: "finding",
        label: "Film review",
        type: "select",
        required: true,
        options: FILM_REVIEW_OPTIONS,
      },
      {
        id: "comment",
        label: "Comment",
        type: "textarea",
        placeholder: "Optional morphology comment",
      },
    ],
    displayTemplate: "{finding}",
    hideFlag: true,
    hideUnits: true,
  },
  "SICKLE_TEST:RESULT": {
    fields: [
      {
        id: "result",
        label: "Sickle solubility",
        type: "select",
        required: true,
        options: [
          { value: "Negative", label: "Negative" },
          { value: "Positive", label: "Positive" },
        ],
      },
    ],
    hideFlag: true,
    hideUnits: true,
  },
  "COOMBS_DCT:RESULT": {
    fields: [
      {
        id: "result",
        label: "Direct Coombs",
        type: "select",
        required: true,
        options: [
          { value: "Negative", label: "Negative" },
          { value: "Positive", label: "Positive" },
        ],
      },
    ],
    hideFlag: true,
    hideUnits: true,
  },
  "COOMBS_ICT:RESULT": {
    fields: [
      {
        id: "result",
        label: "Indirect Coombs",
        type: "select",
        required: true,
        options: [
          { value: "Negative", label: "Negative" },
          { value: "Positive", label: "Positive" },
        ],
      },
    ],
    hideFlag: true,
    hideUnits: true,
  },
};

function schemaKey(
  orderedTestCode: string,
  resultComponentCode?: string | null,
): string {
  const test = normalizeCode(orderedTestCode);
  const component = normalizeCode(resultComponentCode || "RESULT");
  return `${test}:${component}`;
}

export function getManualEntrySchema(
  orderedTestCode: string,
  resultComponentCode?: string | null,
): ManualEntrySchema | null {
  const key = schemaKey(orderedTestCode, resultComponentCode);
  if (MANUAL_ENTRY_SCHEMAS[key]) return MANUAL_ENTRY_SCHEMAS[key];
  const fallback = schemaKey(orderedTestCode, "RESULT");
  return MANUAL_ENTRY_SCHEMAS[fallback] ?? null;
}

export function composeManualResultValue(
  schema: ManualEntrySchema,
  fieldValues: Record<string, string>,
): string {
  if (schema.displayTemplate) {
    return schema.displayTemplate.replace(/\{(\w+)\}/g, (_, id: string) => {
      const value = fieldValues[id]?.trim() ?? "";
      return value;
    });
  }
  return schema.fields
    .map((field) => fieldValues[field.id]?.trim())
    .filter(Boolean)
    .join(" · ");
}

export function computeAutoFlag(
  numericValue: string,
  referenceLow?: number,
  referenceHigh?: number,
  criticalLow?: number,
  criticalHigh?: number,
): "normal" | "high" | "low" | "critical_low" | "critical_high" | "abnormal" | "unknown" {
  if (referenceLow == null || referenceHigh == null) {
    return "unknown";
  }
  return computeClinicalFlag(numericValue, {
    referenceLow,
    referenceHigh,
    criticalLow,
    criticalHigh,
    confirmationStatus: "provisional",
  });
}

export function schemaDefaultUnits(schema: ManualEntrySchema): string | undefined {
  return schema.fields.find((field) => field.defaultUnits)?.defaultUnits;
}

export function schemaReferenceRange(schema: ManualEntrySchema): {
  referenceLow?: number;
  referenceHigh?: number;
} {
  const numericField = schema.fields.find((field) => field.type === "number");
  if (!numericField) return {};
  return {
    referenceLow: numericField.referenceLow,
    referenceHigh: numericField.referenceHigh,
  };
}

export function parseManualPayload(
  raw: string | Record<string, string> | null | undefined,
): Record<string, string> {
  if (!raw) return {};
  if (typeof raw === "object") {
    return Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [key, String(value ?? "")]),
    );
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, String(value ?? "")]),
    );
  } catch {
    return {};
  }
}
