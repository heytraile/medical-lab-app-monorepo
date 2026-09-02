import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  StaffMemberCreateSchema,
  StaffMemberUpdateSchema,
} from "@drax-lis/contracts";
import {
  CurrentUser,
  Roles,
  SupabaseAuthGuard,
  type AuthUser,
} from "../auth/auth.guard";
import { LabStaffService } from "./lab-staff.service";

@Controller("lab/staff")
@UseGuards(SupabaseAuthGuard)
export class LabStaffController {
  constructor(private readonly service: LabStaffService) {}

  @Get("collectors")
  listCollectors(@CurrentUser() user: AuthUser) {
    return this.service.listCollectors(user);
  }

  @Get()
  @Roles("admin")
  list(@CurrentUser() user: AuthUser) {
    return this.service.listAll(user);
  }

  @Post()
  @Roles("admin")
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const parsed = StaffMemberCreateSchema.parse(body);
    return this.service.create(user, parsed);
  }

  @Patch(":id")
  @Roles("admin")
  update(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ) {
    const parsed = StaffMemberUpdateSchema.parse(body);
    return this.service.update(user, id, parsed);
  }
}
