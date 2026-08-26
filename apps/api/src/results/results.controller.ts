import {
  Controller,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { SyncService } from "../sync/sync.service";
import {
  CurrentUser,
  Roles,
  SupabaseAuthGuard,
  type AuthUser,
} from "../auth/auth.guard";

@Controller("results")
@UseGuards(SupabaseAuthGuard)
export class ResultsController {
  constructor(private readonly sync: SyncService) {}

  @Post(":id/release")
  @Roles("authorizer", "admin")
  release(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.sync.releaseResult({
      id,
      releasedBy: user.id,
    });
  }
}
