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
import { StaffMemberUpdateSchema } from "@drax-lis/contracts";
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

  /**
   * Staff signup now only happens on the lab edge app (offline-capable),
   * then pushes to the cloud via the `staff.upsert` outbox event. See
   * docs/EDGE_AUTH_AND_STAFF.md.
   */
  @Post()
  @Roles("admin")
  create(): never {
    throw new ForbiddenException(
      "Create staff on the lab edge app — it syncs here automatically",
    );
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
