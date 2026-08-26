import { Injectable, Logger } from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.module";
import type { SyncEventsRequest, SyncEventsResponse } from "@drax-lis/contracts";

type StoredEvent = {
  eventId: string;
  type: string;
  sequence: number;
  payload: Record<string, unknown>;
  edgeNodeId: string;
  receivedAt: string;
};

/**
 * Idempotent ingest of edge outbox events.
 * With Supabase configured: upsert into `sync_events` (table created later).
 * Without: keep an in-memory set so local Phase 0 demos still work.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private readonly memory = new Map<string, StoredEvent>();

  constructor(private readonly supabase: SupabaseService) {}

  async ingest(request: SyncEventsRequest): Promise<SyncEventsResponse> {
    const ackedEventIds: string[] = [];
    const duplicateEventIds: string[] = [];

    for (const event of request.events) {
      if (this.supabase.enabled && this.supabase.client) {
        const { data: existing } = await this.supabase.client
          .from("sync_events")
          .select("event_id")
          .eq("event_id", event.eventId)
          .maybeSingle();

        if (existing) {
          duplicateEventIds.push(event.eventId);
          continue;
        }

        const { error } = await this.supabase.client.from("sync_events").insert({
          event_id: event.eventId,
          edge_node_id: request.edgeNodeId,
          type: event.type,
          sequence: event.sequence,
          payload: event.payload,
          created_at: event.createdAt,
          received_at: new Date().toISOString(),
        });

        if (error) {
          this.logger.error(`Supabase insert failed: ${error.message}`);
          throw error;
        }
        ackedEventIds.push(event.eventId);
      } else {
        if (this.memory.has(event.eventId)) {
          duplicateEventIds.push(event.eventId);
          continue;
        }
        this.memory.set(event.eventId, {
          eventId: event.eventId,
          type: event.type,
          sequence: event.sequence,
          payload: event.payload,
          edgeNodeId: request.edgeNodeId,
          receivedAt: new Date().toISOString(),
        });
        ackedEventIds.push(event.eventId);
      }
    }

    this.logger.log(
      `Sync from ${request.edgeNodeId}: acked=${ackedEventIds.length} dup=${duplicateEventIds.length}`,
    );

    return { ackedEventIds, duplicateEventIds };
  }

  listMemory() {
    return Array.from(this.memory.values()).sort(
      (a, b) => a.sequence - b.sequence,
    );
  }
}
