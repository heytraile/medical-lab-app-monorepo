import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { randomUUID } from "crypto";

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private draining = false;

  constructor(private readonly prisma: PrismaService) {}

  async enqueue(input: {
    type: string;
    payload: Record<string, unknown>;
  }) {
    const meta = await this.prisma.syncMeta.update({
      where: { id: "singleton" },
      data: { nextSequence: { increment: 1 } },
    });
    const sequence = meta.nextSequence - 1;

    return this.prisma.outboxEvent.create({
      data: {
        eventId: randomUUID(),
        type: input.type,
        status: "pending",
        sequence,
        payload: JSON.stringify(input.payload),
      },
    });
  }

  @Cron(process.env.SYNC_CRON ?? "*/15 * * * * *")
  async drainOutbox() {
    if (this.draining) return;
    if (process.env.CLOUD_SYNC_ENABLED === "false") return;

    this.draining = true;
    try {
      const pending = await this.prisma.outboxEvent.findMany({
        where: { status: { in: ["pending", "failed"] } },
        orderBy: { sequence: "asc" },
        take: 50,
      });
      if (!pending.length) return;

      const cloudUrl = process.env.CLOUD_API_URL ?? "http://localhost:3102";
      const edgeNodeId = process.env.EDGE_NODE_ID ?? "edge-unknown";

      for (const row of pending) {
        await this.prisma.outboxEvent.update({
          where: { id: row.id },
          data: { status: "syncing", attempts: { increment: 1 } },
        });
      }

      const body = {
        edgeNodeId,
        events: pending.map((e) => ({
          eventId: e.eventId,
          type: e.type,
          status: "pending",
          sequence: e.sequence,
          payload: JSON.parse(e.payload) as Record<string, unknown>,
          createdAt: e.createdAt.toISOString(),
          attempts: e.attempts,
        })),
      };

      try {
        const res = await fetch(`${cloudUrl}/sync/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(process.env.EDGE_SYNC_TOKEN
              ? { Authorization: `Bearer ${process.env.EDGE_SYNC_TOKEN}` }
              : {}),
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          throw new Error(`cloud status ${res.status}`);
        }

        const json = (await res.json()) as {
          ackedEventIds: string[];
          duplicateEventIds?: string[];
        };
        const acked = new Set([
          ...(json.ackedEventIds ?? []),
          ...(json.duplicateEventIds ?? []),
        ]);

        for (const row of pending) {
          if (acked.has(row.eventId)) {
            await this.prisma.outboxEvent.update({
              where: { id: row.id },
              data: { status: "acked", lastError: null },
            });
          } else {
            await this.prisma.outboxEvent.update({
              where: { id: row.id },
              data: {
                status: "failed",
                lastError: "not acked by cloud",
              },
            });
          }
        }

        this.logger.log(`Synced ${acked.size}/${pending.length} outbox events`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Sync deferred (offline?): ${msg}`);
        for (const row of pending) {
          await this.prisma.outboxEvent.update({
            where: { id: row.id },
            data: { status: "pending", lastError: msg },
          });
        }
      }
    } finally {
      this.draining = false;
    }
  }

  async getStatus() {
    const [pending, syncing, acked, failed] = await Promise.all([
      this.prisma.outboxEvent.count({ where: { status: "pending" } }),
      this.prisma.outboxEvent.count({ where: { status: "syncing" } }),
      this.prisma.outboxEvent.count({ where: { status: "acked" } }),
      this.prisma.outboxEvent.count({ where: { status: "failed" } }),
    ]);
    return { pending, syncing, acked, failed };
  }
}
