import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { normalizeIsoDateTime } from "./datetime";

const isoDateTime = z.string().datetime();

function assertValidIso(result: string) {
  assert.match(result, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(isoDateTime.safeParse(result).success, true);
}

describe("normalizeIsoDateTime", () => {
  it("normalizes Postgres-style timestamps with space separator and +00", () => {
    const result = normalizeIsoDateTime("2024-01-01 12:00:00.123456+00");
    assertValidIso(result);
    assert.equal(result, "2024-01-01T12:00:00.123Z");
  });

  it("normalizes Postgres-style timestamps with +00:00 offset", () => {
    const result = normalizeIsoDateTime("2024-01-01 12:00:00.123456+00:00");
    assertValidIso(result);
    assert.equal(result, "2024-01-01T12:00:00.123Z");
  });

  it("passes through already-valid ISO strings", () => {
    const iso = "2024-06-15T08:30:00.000Z";
    assert.equal(normalizeIsoDateTime(iso), iso);
  });

  it("normalizes Date instances", () => {
    const date = new Date("2024-03-10T14:00:00.000Z");
    assert.equal(normalizeIsoDateTime(date), date.toISOString());
  });

  it("falls back to epoch for invalid input", () => {
    assert.equal(normalizeIsoDateTime("not-a-date"), new Date(0).toISOString());
    assert.equal(normalizeIsoDateTime(null), new Date(0).toISOString());
    assert.equal(normalizeIsoDateTime(""), new Date(0).toISOString());
  });
});
