import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  DeviceEnrollmentCodeCreateSchema,
  StaffMemberCreateSchema,
  StaffMemberUpdateSchema,
} from "@drax-lis/contracts";
import { StaffService } from "./staff.service";
import { DeviceEnrollmentService } from "./device-enrollment.service";
import { HardenedAuthGuard } from "../auth/hardened-auth.guard";
import { OptionalUser, Roles, type AuthUser } from "../auth/auth.guard";

@Controller("staff")
export class StaffController {
  constructor(
    private readonly staff: StaffService,
    private readonly deviceEnrollment: DeviceEnrollmentService,
  ) {}

  @Get()
  @UseGuards(HardenedAuthGuard)
  @Roles("admin")
  list() {
    return this.staff.list();
  }

  @Post()
  @UseGuards(HardenedAuthGuard)
  @Roles("admin")
  create(@Body() body: unknown) {
    const parsed = StaffMemberCreateSchema.parse(body);
    return this.staff.create(parsed);
  }

  @Patch(":id")
  @UseGuards(HardenedAuthGuard)
  @Roles("admin")
  update(@Param("id") id: string, @Body() body: unknown) {
    const parsed = StaffMemberUpdateSchema.parse(body);
    const password =
      typeof (body as { password?: unknown } | null)?.password === "string"
        ? (body as { password: string }).password
        : undefined;
    if (password && password.length < 8) {
      throw new ForbiddenException("Password must be at least 8 characters");
    }
    return this.staff.update(id, { ...parsed, password });
  }

  /**
   * One-time bootstrap: create the very first admin on a brand new lab PC.
   * No auth required — this route locks itself out the moment any Staff
   * row exists, so it cannot be used to create a second account.
   */
  @Post("bootstrap-admin")
  async bootstrapAdmin(@Body() body: unknown) {
    const count = await this.staff.count();
    if (count > 0) {
      throw new ForbiddenException(
        "Staff already exist on this lab PC — sign in and add staff from the admin screen",
      );
    }
    const parsed = StaffMemberCreateSchema.parse(body);
    return this.staff.create({ ...parsed, role: "admin" });
  }

  /** Admin issues a one-time code so a specific admin/authorizer can enroll a cloud device. */
  @Post("devices/enrollment-codes")
  @UseGuards(HardenedAuthGuard)
  @Roles("admin")
  issueDeviceCode(@Body() body: unknown, @OptionalUser() user?: AuthUser) {
    const parsed = DeviceEnrollmentCodeCreateSchema.parse(body);
    return this.deviceEnrollment.issueCode(parsed, user?.id ?? "dev-admin");
  }
}
