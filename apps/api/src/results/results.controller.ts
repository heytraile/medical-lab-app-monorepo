import {
  Body,
  Controller,
  Post,
  UseGuards,
} from "@nestjs/common";
import type { DeviceSnapshot, ReleaseAccessionRequest } from "@drax-lis/contracts";
import { SyncService } from "../sync/sync.service";
import { AuditService } from "../audit/audit.service";
import { CurrentDevice, LabDeviceGuard } from "../devices/lab-device.guard";
import {
  CurrentUser,
  Roles,
  SupabaseAuthGuard,
  toActorSnapshot,
  type AuthUser,
} from "../auth/auth.guard";

/**
 * Cloud login always requires a lab-issued device — every release/recall
 * here is attributed to both the signed-in authorizer AND the device they
 * used (see docs/EDGE_AUTH_AND_STAFF.md, docs/AUDIT.md).
 */
@Controller("results")
@UseGuards(SupabaseAuthGuard, LabDeviceGuard)
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
    @CurrentDevice() device: DeviceSnapshot | undefined,
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
      device: device ?? null,
      payload: {
        accessionNumber: body.accessionNumber,
        resultIds: released.resultIds,
        testCount: released.releasedCount,
      },
    });
    return released;
  }

}
