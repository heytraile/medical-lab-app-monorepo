import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { LabRoutingPolicyPatchSchema } from "@drax-lis/contracts";
import {
  CurrentUser,
  Roles,
  SupabaseAuthGuard,
  type AuthUser,
} from "../auth/auth.guard";
import { LabsService } from "./labs.service";

@Controller("labs")
@UseGuards(SupabaseAuthGuard)
export class LabsController {
  constructor(private readonly labs: LabsService) {}

  @Get("settings")
  @Roles("admin")
  getSettings(@CurrentUser() user: AuthUser) {
    return this.labs.getSettings(user);
  }

  @Patch("settings/routing")
  @Roles("admin")
  patchRouting(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const patch = LabRoutingPolicyPatchSchema.parse(body);
    return this.labs.patchRoutingPolicy(user, patch);
  }
}
