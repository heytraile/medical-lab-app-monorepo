import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ActorSnapshot } from "@drax-lis/contracts";
import { isProductionHardened } from "../config/production-hardening";
import { rejectDevTokenInHardenedMode } from "./hardened-auth.guard";
import { EdgeJwtService } from "./edge-jwt.service";

export type AuthUser = {
  id: string;
  email?: string;
  role: "tech" | "authorizer" | "admin";
  fullName?: string | null;
  jobTitle?: string | null;
};

export const ROLES_KEY = "roles";
export const Roles = (...roles: Array<AuthUser["role"]>) =>
  SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!req.user) throw new UnauthorizedException("Not authenticated");
    return req.user;
  },
);

export const OptionalUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    return req.user;
  },
);

export function toActorSnapshot(user: AuthUser): ActorSnapshot {
  return {
    userId: user.id,
    email: user.email ?? null,
    fullName: user.fullName ?? null,
    role: user.role,
    jobTitle: (user.jobTitle as ActorSnapshot["jobTitle"]) ?? null,
  };
}

function devUserFromToken(token: string): AuthUser | null {
  const role = token.slice(4) as AuthUser["role"];
  if (!["tech", "authorizer", "admin"].includes(role)) return null;
  return {
    id: `dev-${role}`,
    email: `${role}@local.dev`,
    role,
    fullName: `Dev ${role}`,
  };
}

/**
 * Requires a valid edge-issued session JWT (see `EdgeJwtService`).
 *
 * Edge login never talks to the internet — the token is signed and verified
 * locally against `EDGE_JWT_SECRET`, so bench staff can sign in offline.
 */
@Injectable()
export class EdgeAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: EdgeJwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: AuthUser;
    }>();
    const header = req.headers.authorization;
    const token = header?.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      throw new UnauthorizedException("Missing Authorization bearer token");
    }

    rejectDevTokenInHardenedMode(token);

    if (token.startsWith("dev:") && !isProductionHardened()) {
      const devUser = devUserFromToken(token);
      if (!devUser) throw new UnauthorizedException("Invalid dev role token");
      req.user = devUser;
      return this.assertRoles(context, devUser);
    }

    const payload = this.jwt.verify(token);
    if (!payload) {
      throw new UnauthorizedException("Invalid or expired session token");
    }

    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      fullName: payload.fullName,
      jobTitle: payload.jobTitle,
    };
    return this.assertRoles(context, req.user);
  }

  private assertRoles(context: ExecutionContext, user: AuthUser): boolean {
    const required = this.reflector.getAllAndOverride<Array<AuthUser["role"]>>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (required?.length) {
      const ok =
        required.includes(user.role) ||
        (user.role === "admin" && required.includes("authorizer"));
      if (!ok) {
        throw new ForbiddenException(
          `Requires role: ${required.join(" | ")} (have ${user.role})`,
        );
      }
    }
    return true;
  }
}

/** Sets req.user when a valid bearer token is present; allows anonymous requests. */
@Injectable()
export class OptionalEdgeAuthGuard implements CanActivate {
  constructor(private readonly jwt: EdgeJwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: AuthUser;
    }>();
    const header = req.headers.authorization;
    const token = header?.replace(/^Bearer\s+/i, "").trim();
    if (!token) return true;

    rejectDevTokenInHardenedMode(token);

    if (token.startsWith("dev:") && !isProductionHardened()) {
      const devUser = devUserFromToken(token);
      if (devUser) req.user = devUser;
      return true;
    }

    const payload = this.jwt.verify(token);
    if (!payload) return true;

    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      fullName: payload.fullName,
      jobTitle: payload.jobTitle,
    };
    return true;
  }
}
