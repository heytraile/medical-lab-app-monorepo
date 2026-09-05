import {
  Body,
  Controller,
  Get,
  Post,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { EdgeLoginRequestSchema } from "@drax-lis/contracts";
import { StaffService } from "./staff.service";
import { EdgeJwtService } from "../auth/edge-jwt.service";
import { verifyPassword } from "../auth/password.util";
import { AuditService } from "../audit/audit.service";
import { CurrentUser, EdgeAuthGuard, type AuthUser } from "../auth/auth.guard";

/**
 * Edge login — bench staff sign in here, entirely offline. No Supabase, no
 * internet call: the password check and the session token are both local.
 */
@Controller("auth")
export class AuthController {
  constructor(
    private readonly staff: StaffService,
    private readonly jwt: EdgeJwtService,
    private readonly audit: AuditService,
  ) {}

  @Post("login")
  async login(@Body() body: unknown) {
    const { email, password } = EdgeLoginRequestSchema.parse(body);
    const row = await this.staff.findActiveByEmail(email);

    if (!row || !verifyPassword(password, row.passwordHash)) {
      await this.audit.log({
        eventType: "staff.login_failed",
        entityType: "staff",
        entityId: row?.id ?? email,
        payload: { email },
      });
      throw new UnauthorizedException("Invalid email or password");
    }

    const role = row.role as AuthUser["role"];
    const accessToken = this.jwt.sign({
      sub: row.id,
      email: row.email,
      role,
      fullName: row.fullName,
      jobTitle: row.jobTitle,
    });

    await this.audit.log({
      eventType: "staff.login",
      entityType: "staff",
      entityId: row.id,
      actor: {
        userId: row.id,
        email: row.email,
        fullName: row.fullName,
        role,
      },
      payload: { email: row.email },
    });

    return {
      accessToken,
      user: {
        id: row.id,
        email: row.email,
        fullName: row.fullName,
        role,
        jobTitle: row.jobTitle,
        isActive: row.isActive,
      },
    };
  }

  @Get("me")
  @UseGuards(EdgeAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
