import {
  Body,
  Controller,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import type { ReleaseAccessionRequest } from "@drax-lis/contracts";
import { SyncService } from "../sync/sync.service";
import { AuditService } from "../audit/audit.service";
import {
  CurrentUser,
  Roles,
  SupabaseAuthGuard,
  toActorSnapshot,
  type AuthUser,
} from "../auth/auth.guard";

@Controller("results")
@UseGuards(SupabaseAuthGuard)
export class ResultsController {
  constructor(
    private readonly sync: SyncService,
    private readonly audit: AuditService,
  ) {}

  @Post("release-accession")
  @Roles("authorizer", "admin")
  async releaseAccession(
    @Body() body: ReleaseAccessionRequest,
    @CurrentUser() user: AuthUser,
  ) {
    const actor = toActorSnapshot(user);
    const released = await this.sync.releaseAccession({
      accessionNumber: body.accessionNumber,
      releasedBy: user.id,
      releasedBySnapshot: actor,
    });
    await this.audit.log({
      eventType: "result.accession_released",
      entityType: "accession",
      entityId: body.accessionNumber,
      actor,
      payload: {
        accessionNumber: body.accessionNumber,
        resultIds: released.resultIds,
        testCount: released.releasedCount,
      },
    });
    return released;
  }

  @Post(":id/release")
  @Roles("authorizer", "admin")
  async release(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    const actor = toActorSnapshot(user);
    const row = await this.sync.releaseResult({
      id,
      releasedBy: user.id,
      releasedBySnapshot: actor,
    });
    await this.audit.log({
      eventType: "result.released",
      entityType: "result",
      entityId: id,
      actor,
      payload: {
        accessionNumber: row.accession_number,
        testCode: row.test_code,
      },
    });
    return row;
  }
}
