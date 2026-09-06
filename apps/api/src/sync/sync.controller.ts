import { Body, Controller, Get, Headers, Post, Query } from "@nestjs/common";
import { SyncService, assertEdgeSyncToken } from "./sync.service";
import { SyncEventsRequestSchema } from "@drax-lis/contracts";

@Controller("sync")
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post("events")
  async events(
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
  ) {
    assertEdgeSyncToken(authorization);
    const parsed = SyncEventsRequestSchema.parse(body);
    return this.sync.ingest(parsed);
  }

  /** Edge pull: cloud-originated messages since cursor. */
  @Get("messages/pull")
  async pullMessages(
    @Query("since") since: string | undefined,
    @Headers("authorization") authorization?: string,
  ) {
    assertEdgeSyncToken(authorization);
    return this.sync.pullMessagesSince(
      since?.trim() || new Date(0).toISOString(),
    );
  }

  /** Local-dev only: peek at in-memory store when Supabase is unset. */
  @Get("events")
  list() {
    return this.sync.listMemory();
  }
}
