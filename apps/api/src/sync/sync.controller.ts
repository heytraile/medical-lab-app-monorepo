import { Body, Controller, Get, Post } from "@nestjs/common";
import { SyncService } from "./sync.service";
import { SyncEventsRequestSchema } from "@drax-lis/contracts";

@Controller("sync")
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post("events")
  async events(@Body() body: unknown) {
    const parsed = SyncEventsRequestSchema.parse(body);
    return this.sync.ingest(parsed);
  }

  /** Local-dev only: peek at in-memory store when Supabase is unset. */
  @Get("events")
  list() {
    return this.sync.listMemory();
  }
}
