import { Injectable, Logger } from "@nestjs/common";
import type { ActorSnapshot, ClinicalAuditEventType } from "@drax-lis/contracts";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(input: {
    eventType: ClinicalAuditEventType;
    entityType: string;
    entityId: string;
    actor?: ActorSnapshot | null;
    payload?: Record<string, unknown>;
  }) {
    try {
      await this.prisma.auditEvent.create({
        data: {
          eventType: input.eventType,
          entityType: input.entityType,
          entityId: input.entityId,
          actorUserId: input.actor?.userId ?? null,
          actorSnapshot: input.actor ? JSON.stringify(input.actor) : null,
          payload: JSON.stringify(input.payload ?? {}),
          edgeNodeId: process.env.EDGE_NODE_ID ?? null,
        },
      });
    } catch (err) {
      this.logger.error(
        `Audit log failed for ${input.eventType}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
