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
import type { ActorSnapshot, StaffJobTitle } from "@drax-lis/contracts";
import { StaffJobTitleSchema } from "@drax-lis/contracts";
import { SupabaseService } from "../supabase/supabase.module";
import { DEV_ROLE_JOB_TITLES } from "../lab-staff/staff-labels";

export type AuthUser = {
  id: string;
  email?: string;
  role: "tech" | "authorizer" | "admin";
  fullName?: string | null;
  jobTitle?: StaffJobTitle | null;
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

export function toActorSnapshot(user: AuthUser): ActorSnapshot {
  return {
    userId: user.id,
    email: user.email ?? null,
    fullName: user.fullName ?? null,
    role: user.role,
    jobTitle: user.jobTitle ?? null,
  };
}

function parseJobTitle(value: unknown): StaffJobTitle | null {
  const parsed = StaffJobTitleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
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

    // Dev bypass when Supabase unset (or local dev tokens): Bearer dev:authorizer
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
          jobTitle: DEV_ROLE_JOB_TITLES[role],
        };
    } else if (!this.supabase.enabled || !this.supabase.client) {
      throw new UnauthorizedException(
        "Supabase unset — use Authorization: Bearer dev:authorizer|tech|admin",
      );
    } else {
      const authClient = this.supabase.authClient ?? this.supabase.client;
      const { data, error } = await authClient.auth.getUser(token);
      if (error || !data.user) {
        throw new UnauthorizedException("Invalid session token");
      }
      const { data: profile } = await this.supabase.client
        .from("profiles")
        .select("role, email, full_name, job_title")
        .eq("id", data.user.id)
        .maybeSingle();
      const metaRole = data.user.user_metadata?.role as string | undefined;
      const role =
        (profile?.role as AuthUser["role"]) ??
        (["tech", "authorizer", "admin"].includes(metaRole ?? "")
          ? (metaRole as AuthUser["role"])
          : "tech");
      req.user = {
        id: data.user.id,
        email: profile?.email ?? data.user.email,
        role,
        fullName: (profile?.full_name as string | null) ?? null,
        jobTitle: parseJobTitle(profile?.job_title),
      };
    }

    const required = this.reflector.getAllAndOverride<Array<AuthUser["role"]>>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (required?.length) {
      const user = req.user!;
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
