import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DRAX_HALL_ROUTING_POLICY,
  ROUTING_PRESET_CONSOLIDATED_DHMS,
  normalizeLabRoutingPolicy,
  resolveRoutingForScope,
} from "./routing-departments";
import { buildSpecimenLabelInput } from "./specimen-label-input";

describe("normalizeLabRoutingPolicy", () => {
  it("defaults to Drax Hall split policy", () => {
    const policy = normalizeLabRoutingPolicy(null);
    assert.equal(policy.accession.mode, "granular");
    assert.equal(policy.labels.mode, "consolidated");
  });

  it("maps legacy single routing to both scopes", () => {
    const policy = normalizeLabRoutingPolicy(ROUTING_PRESET_CONSOLIDATED_DHMS);
    assert.equal(policy.accession.mode, "consolidated");
    assert.equal(policy.labels.mode, "consolidated");
  });

  it("preserves new policy shape", () => {
    const policy = normalizeLabRoutingPolicy(DRAX_HALL_ROUTING_POLICY);
    assert.equal(policy.accession.mode, "granular");
    assert.equal(policy.labels.mode, "consolidated");
    assert.equal(policy.labels.splitByCollectionType, true);
  });
});

describe("resolveRoutingForScope", () => {
  it("returns granular for accession when configured", () => {
    const routing = resolveRoutingForScope(
      DRAX_HALL_ROUTING_POLICY,
      "accession",
    );
    assert.equal(routing.mode, "granular");
    assert.equal(routing.departments.length, 12);
  });

  it("returns consolidated for labels when configured", () => {
    const routing = resolveRoutingForScope(DRAX_HALL_ROUTING_POLICY, "labels");
    assert.equal(routing.mode, "consolidated");
    assert.equal(routing.departments.length, 3);
  });
});

describe("buildSpecimenLabelInput consolidated", () => {
  it("maps granular category to consolidated short label", () => {
    const input = buildSpecimenLabelInput({
      accessionNumber: "DH202608260001",
      specimenNumber: "DH202608260001-02",
      patientName: "Jane Doe",
      barcode: "DH202608260001-02",
      dateOfBirth: "1980-01-01",
      catalogCategory: "blood_chemistry",
      collectionType: "blood",
      orderedTestCodes: ["CREATININE"],
      routing: resolveRoutingForScope(DRAX_HALL_ROUTING_POLICY, "labels"),
    });
    assert.equal(input.departmentLabelShort, "Chem");
    assert.equal(input.collectionLabelShort, "Bld");
  });
});
