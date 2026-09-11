import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupSpecimensForLabelPrint } from "./label-print-groups";
import {
  DRAX_HALL_ROUTING_POLICY,
  resolveRoutingForScope,
} from "./routing-departments";

describe("groupSpecimensForLabelPrint", () => {
  it("returns one label group per specimen with consolidated routing metadata", () => {
    const labelRouting = resolveRoutingForScope(
      DRAX_HALL_ROUTING_POLICY,
      "labels",
    );
    const groups = groupSpecimensForLabelPrint(
      [
        {
          id: "s1",
          accessionNumber: "DH202608260001",
          specimenNumber: "DH202608260001-01",
          barcode: "DH202608260001-01",
          departmentKey: "blood_chemistry",
          collectionType: "blood",
          orderedTestCodes: ["CREATININE"],
        },
        {
          id: "s2",
          accessionNumber: "DH202608260001",
          specimenNumber: "DH202608260001-02",
          barcode: "DH202608260001-02",
          departmentKey: "immunology",
          collectionType: "blood",
          orderedTestCodes: ["VDRL"],
        },
      ],
      labelRouting,
    );
    assert.equal(groups.length, 2);
    assert.equal(groups[0]?.departmentKey, "chemistry");
    assert.equal(groups[0]?.departmentLabelShort, "Chem");
    assert.equal(groups[0]?.catalogCategory, "blood_chemistry");
    assert.deepEqual(groups[0]?.orderedTestCodes, ["CREATININE"]);
    assert.equal(groups[1]?.catalogCategory, "immunology");
    assert.deepEqual(groups[1]?.orderedTestCodes, ["VDRL"]);
  });

  it("does not merge separate blood tubes that share consolidated routing", () => {
    const labelRouting = resolveRoutingForScope(
      DRAX_HALL_ROUTING_POLICY,
      "labels",
    );
    const groups = groupSpecimensForLabelPrint(
      [
        {
          id: "a",
          accessionNumber: "DH202608260001",
          specimenNumber: "DH202608260001-02",
          barcode: "DH202608260001-02",
          departmentKey: "blood_chemistry",
          collectionType: "blood",
          orderedTestCodes: ["CREATININE"],
        },
        {
          id: "b",
          accessionNumber: "DH202608260001",
          specimenNumber: "DH202608260001-03",
          barcode: "DH202608260001-03",
          departmentKey: "immunology",
          collectionType: "blood",
          orderedTestCodes: ["VDRL"],
        },
      ],
      labelRouting,
    );
    assert.equal(groups.length, 2);
    assert.equal(groups[0]?.primarySpecimenNumber, "DH202608260001-02");
    assert.equal(groups[1]?.primarySpecimenNumber, "DH202608260001-03");
  });
});
