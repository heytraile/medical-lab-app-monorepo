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
import { SupabaseService } from "../supabase/supabase.module";
import type { ActorSnapshot } from "@drax-lis/contracts";

export type AuthUser = {
  id: string;
  email?: string;
  role: "tech" | "authorizer" | "admin";
  fullName?: string | null;
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
  };
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: AuthUser;
    }>();
    const header = req.headers.authorization;
    const token = header?.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      throw new UnauthorizedException("Missing Authorization bearer token");
    }

    if (
      token.startsWith("dev:") &&
      (!this.supabase.enabled ||
        !this.supabase.client ||
        process.env.NODE_ENV !== "production")
    ) {
      const role = token.slice(4) as AuthUser["role"];
      if (!["tech", "authorizer", "admin"].includes(role)) {
        throw new UnauthorizedException("Invalid dev role token");
      }
      req.user = {
        id: `dev-${role}`,
        email: `${role}@local.dev`,
        role,
        fullName: `Dev ${role}`,
      };
      return this.assertRoles(context, req.user);
    }

    if (!this.supabase.enabled || !this.supabase.authClient) {
      throw new UnauthorizedException(
        "Sign in required — Supabase auth not configured on edge",
      );
    }

    const { data, error } = await this.supabase.authClient.auth.getUser(token);
    if (error || !data.user) {
      throw new UnauthorizedException("Invalid session token");
    }

    let role: AuthUser["role"] = "tech";
    let fullName: string | null = null;
    if (this.supabase.client) {
      const { data: profile } = await this.supabase.client
        .from("profiles")
        .select("role, email, full_name")
        .eq("id", data.user.id)
        .maybeSingle();
      if (profile?.role === "authorizer" || profile?.role === "admin") {
        role = profile.role;
      } else if (profile?.role === "tech") {
        role = "tech";
      }
      fullName = (profile?.full_name as string | null) ?? null;
    }

    req.user = {
      id: data.user.id,
      email: data.user.email,
      role,
      fullName,
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
export class OptionalSupabaseAuthGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: AuthUser;
    }>();
    const header = req.headers.authorization;
    const token = header?.replace(/^Bearer\s+/i, "").trim();
    if (!token) return true;

    if (
      token.startsWith("dev:") &&
      (!this.supabase.enabled ||
        !this.supabase.client ||
        process.env.NODE_ENV !== "production")
    ) {
      const role = token.slice(4) as AuthUser["role"];
      if (["tech", "authorizer", "admin"].includes(role)) {
        req.user = {
          id: `dev-${role}`,
          email: `${role}@local.dev`,
          role,
          fullName: `Dev ${role}`,
        };
      }
      return true;
    }

    if (!this.supabase.enabled || !this.supabase.authClient) return true;

    const { data, error } = await this.supabase.authClient.auth.getUser(token);
    if (error || !data.user) return true;

    let role: AuthUser["role"] = "tech";
    let fullName: string | null = null;
    if (this.supabase.client) {
      const { data: profile } = await this.supabase.client
        .from("profiles")
        .select("role, email, full_name")
        .eq("id", data.user.id)
        .maybeSingle();
      if (profile?.role === "authorizer" || profile?.role === "admin") {
        role = profile.role;
      } else if (profile?.role === "tech") {
        role = "tech";
      }
      fullName = (profile?.full_name as string | null) ?? null;
    }

    req.user = {
      id: data.user.id,
      email: data.user.email,
      role,
      fullName,
    };
    return true;
  }
}
