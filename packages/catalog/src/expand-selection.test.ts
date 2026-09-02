import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  expandSelections,
  selectionsNeedFasting,
  type OrderSelection,
} from "./expand-selection";

describe("expandSelections", () => {
  const panels = [
    {
      code: "ANAEMIA_I",
      name: "Anaemia I",
      memberCodes: ["CBC", "RETICULOCYTE", "FERRITIN"],
      members: [
        { code: "CBC", name: "CBC", category: "haematology" },
        { code: "RETICULOCYTE", name: "RETICULOCYTE", category: "anaemia" },
        { code: "FERRITIN", name: "FERRITIN", category: "anaemia" },
      ],
    },
  ];

  it("expands a panel to member tests", () => {
    const selections: OrderSelection[] = [{ kind: "panel", code: "ANAEMIA_I" }];
    const out = expandSelections(selections, panels);
    assert.equal(out.length, 3);
    assert.ok(out.some((t) => t.code === "CBC" && t.sourcePanel === "Anaemia I"));
  });

  it("deduplicates when panel and individual overlap", () => {
    const selections: OrderSelection[] = [
      { kind: "panel", code: "ANAEMIA_I" },
      { kind: "test", code: "CBC" },
      { kind: "test", code: "ESR" },
    ];
    const items = [
      ...(panels[0]?.members ?? []),
      { code: "ESR", name: "ESR", category: "haematology" },
    ];
    const out = expandSelections(selections, panels, items);
    const codes = out.map((t) => t.code);
    assert.equal(new Set(codes).size, codes.length);
    assert.ok(codes.includes("ESR"));
    assert.equal(codes.filter((c) => c === "CBC").length, 1);
  });
});

describe("selectionsNeedFasting", () => {
  it("flags hypertension panel", () => {
    const panels = [
      {
        code: "HYPERTENSION",
        name: "Hypertension",
        description: "Patient must be fasting 10–14 hours",
        memberCodes: ["CHOL"],
        members: [
          {
            code: "TOTAL_CHOLESTEROL",
            name: "TOTAL CHOLESTEROL",
            category: "blood_chemistry",
            fastingRequired: true,
          },
        ],
      },
    ];
    const selections: OrderSelection[] = [
      { kind: "panel", code: "HYPERTENSION" },
    ];
    const expanded = expandSelections(selections, panels);
    assert.equal(
      selectionsNeedFasting(expanded, panels, selections),
      true,
    );
  });
});
