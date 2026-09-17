import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isEdgeTokenExpired,
  jwtExpiresAt,
  readDevRoleFromStorage,
  readEdgeSessionFromStorage,
  readStoredAccessTokenFromStorage,
} from "./auth-storage.ts";

function mockStorage(map: Record<string, string> = {}) {
  const data = new Map(Object.entries(map));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

function jwtWithExp(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  );
  const payload = Buffer.from(JSON.stringify({ exp, sub: "u1" })).toString(
    "base64url",
  );
  return `${header}.${payload}.sig`;
}

describe("auth storage helpers", () => {
  it("reads a valid edge session from storage", () => {
    const token = jwtWithExp(Math.floor(Date.now() / 1000) + 3600);
    const storage = mockStorage({
      "lis-edge-token": JSON.stringify({
        accessToken: token,
        user: {
          id: "u1",
          email: "tech@draxhall.local",
          fullName: "Tech User",
          role: "tech",
        },
      }),
    });
    const session = readEdgeSessionFromStorage(storage);
    assert.ok(session);
    assert.equal(session.accessToken, token);
    assert.equal(session.user.role, "tech");
  });

  it("clears expired edge sessions", () => {
    const token = jwtWithExp(Math.floor(Date.now() / 1000) - 60);
    const storage = mockStorage({
      "lis-edge-token": JSON.stringify({
        accessToken: token,
        user: {
          id: "u1",
          email: "tech@draxhall.local",
          fullName: "Tech User",
          role: "tech",
        },
      }),
    });
    assert.equal(readEdgeSessionFromStorage(storage), null);
    assert.equal(storage.getItem("lis-edge-token"), null);
  });

  it("returns null for missing or malformed edge storage", () => {
    assert.equal(readEdgeSessionFromStorage(mockStorage()), null);
    const storage = mockStorage({ "lis-edge-token": "not-json" });
    assert.equal(readEdgeSessionFromStorage(storage), null);
    assert.equal(storage.getItem("lis-edge-token"), null);
  });

  it("reads dev role in cloud mode helper", () => {
    const storage = mockStorage({ "lis-dev-role": "authorizer" });
    assert.equal(readDevRoleFromStorage(storage), "authorizer");
    assert.equal(
      readStoredAccessTokenFromStorage(true, storage),
      "dev:authorizer",
    );
  });

  it("decodes jwt exp", () => {
    const exp = 1_900_000_000;
    assert.equal(jwtExpiresAt(jwtWithExp(exp)), exp);
    assert.equal(isEdgeTokenExpired(jwtWithExp(exp), exp + 1), true);
    assert.equal(isEdgeTokenExpired(jwtWithExp(exp), exp - 1), false);
  });
});
