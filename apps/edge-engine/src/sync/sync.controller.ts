import { Controller, Get, Post } from "@nestjs/common";
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
    return this.sync.getStatus();
  }
}
