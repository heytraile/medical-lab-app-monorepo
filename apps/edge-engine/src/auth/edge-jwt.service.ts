import { Injectable, Logger } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { isProductionHardened } from "../config/production-hardening";

export type EdgeJwtRole = "tech" | "authorizer" | "admin";

export type EdgeJwtPayload = {
  sub: string;
  email: string;
  role: EdgeJwtRole;
  fullName: string | null;
  jobTitle: string | null;
  iat: number;
  exp: number;
};

const DEV_INSECURE_SECRET = "dev-insecure-edge-jwt-secret-change-me";
const DEFAULT_TTL_SECONDS = 60 * 60 * 12; // 12h — bench shift length

function base64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

/**
 * Signs and verifies the edge's own login session tokens.
 *
 * These are NOT Supabase JWTs — the edge issues them itself so bench staff
 * can sign in with zero internet dependency. HMAC-SHA256, self-contained
 * (no DB lookup needed to verify), same trust boundary as the old dev:
 * tokens but backed by a real password check at login time.
 */
@Injectable()
export class EdgeJwtService {
  private readonly logger = new Logger(EdgeJwtService.name);
  private warned = false;

  private get secret(): string {
    const configured = process.env.EDGE_JWT_SECRET?.trim();
    if (configured) return configured;
    if (isProductionHardened()) {
      throw new Error(
        "EDGE_JWT_SECRET is required when edge hardening is enabled",
      );
    }
    if (!this.warned) {
      this.logger.warn(
        "EDGE_JWT_SECRET unset — using an insecure dev default. Set EDGE_JWT_SECRET before going live.",
      );
      this.warned = true;
    }
    return DEV_INSECURE_SECRET;
  }

  sign(
    input: Omit<EdgeJwtPayload, "iat" | "exp">,
    ttlSeconds = DEFAULT_TTL_SECONDS,
  ): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: EdgeJwtPayload = { ...input, iat: now, exp: now + ttlSeconds };
    const headerB64 = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payloadB64 = base64url(JSON.stringify(payload));
    const signature = this.hmac(`${headerB64}.${payloadB64}`);
    return `${headerB64}.${payloadB64}.${signature}`;
  }

  verify(token: string): EdgeJwtPayload | null {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signature] = parts;
    if (!headerB64 || !payloadB64 || !signature) return null;

    const expected = this.hmac(`${headerB64}.${payloadB64}`);
    if (!this.timingSafeStringEqual(signature, expected)) return null;

    try {
      const payload = JSON.parse(
        Buffer.from(payloadB64, "base64url").toString("utf8"),
      ) as EdgeJwtPayload;
      if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  private hmac(data: string): string {
    return createHmac("sha256", this.secret).update(data).digest("base64url");
  }

  private timingSafeStringEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}
