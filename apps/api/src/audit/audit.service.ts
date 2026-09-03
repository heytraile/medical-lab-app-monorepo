import { Injectable, Logger } from "@nestjs/common";
import type {
  ActorSnapshot,
  ClinicalAuditEventType,
} from "@drax-lis/contracts";
import { SupabaseService } from "../supabase/supabase.module";

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async log(input: {
    eventType: ClinicalAuditEventType;
    entityType: string;
    entityId: string;
    actor?: ActorSnapshot | null;
    payload?: Record<string, unknown>;
    edgeNodeId?: string | null;
  }) {
    if (!this.supabase.enabled || !this.supabase.client) {
      this.logger.debug(
        `Audit (memory skip): ${input.eventType} ${input.entityId}`,
      );
      return;
    }

    try {
      const { error } = await this.supabase.client
        .from("clinical_audit_log")
        .insert({
          event_type: input.eventType,
          entity_type: input.entityType,
          entity_id: input.entityId,
          actor_user_id: input.actor?.userId ?? null,
          actor_snapshot: input.actor ?? null,
          payload: input.payload ?? {},
          edge_node_id: input.edgeNodeId ?? null,
        });
      if (error) throw error;
    } catch (err) {
      this.logger.error(
        `Audit log failed for ${input.eventType}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
