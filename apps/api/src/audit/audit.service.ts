import { Injectable, Logger } from "@nestjs/common";
import type {
  ActorSnapshot,
  ClinicalAuditEventType,
  DeviceSnapshot,
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
    /** Which lab-issued device performed this action, and who it's issued to. */
    device?: DeviceSnapshot | null;
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
          device_id: input.device?.deviceId ?? null,
          device_snapshot: input.device ?? null,
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
