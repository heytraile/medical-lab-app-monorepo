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

export type AuthUser = {
  id: string;
  email?: string;
  role: "tech" | "authorizer" | "admin";
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

    // Dev bypass when Supabase unset: Authorization: Bearer dev:authorizer
    if (!this.supabase.enabled || !this.supabase.client) {
      if (token.startsWith("dev:")) {
        const role = token.slice(4) as AuthUser["role"];
        if (!["tech", "authorizer", "admin"].includes(role)) {
          throw new UnauthorizedException("Invalid dev role token");
        }
        req.user = {
          id: `dev-${role}`,
          email: `${role}@local.dev`,
          role,
        };
      } else {
        throw new UnauthorizedException(
          "Supabase unset — use Authorization: Bearer dev:authorizer|tech|admin",
        );
      }
    } else {
      const { data, error } = await this.supabase.client.auth.getUser(token);
      if (error || !data.user) {
        throw new UnauthorizedException("Invalid session token");
      }
      const { data: profile } = await this.supabase.client
        .from("profiles")
        .select("role, email")
        .eq("id", data.user.id)
        .maybeSingle();
      const role = (profile?.role as AuthUser["role"]) ?? "tech";
      req.user = {
        id: data.user.id,
        email: profile?.email ?? data.user.email,
        role,
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
