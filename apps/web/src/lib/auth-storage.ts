import type { ProfileRole } from "./supabase";

export const DEV_TOKEN_KEY = "lis-dev-role";
export const EDGE_TOKEN_KEY = "lis-edge-token";

export type EdgeSession = {
  accessToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: ProfileRole;
  };
};

const PROFILE_ROLES = new Set<ProfileRole>(["tech", "authorizer", "admin"]);

function parseProfileRole(value: unknown): ProfileRole | null {
  if (typeof value === "string" && PROFILE_ROLES.has(value as ProfileRole)) {
    return value as ProfileRole;
  }
  return null;
}

function decodeBase64Url(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad =
    padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return atob(padded + pad);
}

/** Decode JWT payload exp (seconds since epoch). No signature verify — server still validates. */
export function jwtExpiresAt(accessToken: string): number | null {
  const parts = accessToken.split(".");
  if (parts.length !== 3) return null;
  const payloadB64 = parts[1];
  if (!payloadB64) return null;
  try {
    const payload = JSON.parse(decodeBase64Url(payloadB64)) as {
      exp?: unknown;
    };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

export function isEdgeTokenExpired(
  accessToken: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const exp = jwtExpiresAt(accessToken);
  if (exp == null) return false;
  return exp <= nowSeconds;
}

export function readDevRoleFromStorage(
  storage: Pick<Storage, "getItem"> = localStorage,
): ProfileRole | null {
  const saved = storage.getItem(DEV_TOKEN_KEY);
  return parseProfileRole(saved);
}

export function readEdgeSessionFromStorage(
  storage: Pick<Storage, "getItem" | "removeItem"> = localStorage,
): EdgeSession | null {
  const raw = storage.getItem(EDGE_TOKEN_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as EdgeSession;
    if (
      typeof parsed.accessToken !== "string" ||
      !parsed.accessToken.trim() ||
      !parsed.user ||
      typeof parsed.user.id !== "string" ||
      typeof parsed.user.email !== "string" ||
      typeof parsed.user.fullName !== "string" ||
      !parseProfileRole(parsed.user.role)
    ) {
      storage.removeItem(EDGE_TOKEN_KEY);
      return null;
    }
    if (isEdgeTokenExpired(parsed.accessToken)) {
      storage.removeItem(EDGE_TOKEN_KEY);
      return null;
    }
    return parsed;
  } catch {
    storage.removeItem(EDGE_TOKEN_KEY);
    return null;
  }
}

export function readStoredAccessTokenFromStorage(
  isCloudMode: boolean,
  storage: Pick<Storage, "getItem" | "removeItem"> = localStorage,
): string | null {
  if (isCloudMode) {
    const dev = readDevRoleFromStorage(storage);
    return dev ? `dev:${dev}` : null;
  }
  return readEdgeSessionFromStorage(storage)?.accessToken ?? null;
}
