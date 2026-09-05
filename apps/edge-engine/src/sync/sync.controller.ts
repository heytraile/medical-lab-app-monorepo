import { Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { SyncService } from "./sync.service";
import { BackupService } from "../backup/backup.service";
import { Roles, EdgeAuthGuard } from "../auth/auth.guard";
import { HardenedAuthGuard } from "../auth/hardened-auth.guard";

@Controller("sync")
export class SyncController {
  constructor(
    private readonly sync: SyncService,
    private readonly backup: BackupService,
  ) {}

  @Get("status")
  @UseGuards(HardenedAuthGuard)
  status() {
    return this.sync.getStatus();
  }

  @Post("drain")
  @UseGuards(HardenedAuthGuard)
  async drain() {
    await this.sync.drainOutbox();
    await this.sync.pruneAckedOutbox();
    return this.sync.getStatus();
  }

  /** Trim old acked transport log rows. ?all=true deletes every acked row (local dev). */
  @Post("prune-acked")
  @UseGuards(HardenedAuthGuard)
  async pruneAcked(@Query("all") all?: string) {
    if (all === "true" || all === "1") {
      return this.sync.pruneAllAckedOutbox();
    }
    return this.sync.pruneAckedOutbox();
  }

  /** Manual SQLite hot backup (admin). Automated cron also runs on schedule. */
  @Post("backup")
  @UseGuards(EdgeAuthGuard)
  @Roles("admin")
  async triggerBackup() {
    return this.backup.runBackup();
  }
}
