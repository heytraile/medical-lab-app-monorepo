import { Controller, Get, Post, Query } from "@nestjs/common";
import { SyncService } from "./sync.service";

@Controller("sync")
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get("status")
  status() {
    return this.sync.getStatus();
  }

  @Post("drain")
  async drain() {
    await this.sync.drainOutbox();
    await this.sync.pruneAckedOutbox();
    return this.sync.getStatus();
  }

  /** Trim old acked transport log rows. ?all=true deletes every acked row (local dev). */
  @Post("prune-acked")
  async pruneAcked(@Query("all") all?: string) {
    if (all === "true" || all === "1") {
      return this.sync.pruneAllAckedOutbox();
    }
    return this.sync.pruneAckedOutbox();
  }
}
