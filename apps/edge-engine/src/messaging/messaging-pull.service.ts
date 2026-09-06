import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import {
  CloudMessagesPullResponseSchema,
  type ConversationUpsertEventPayload,
  type MessageCreatedEventPayload,
} from "@drax-lis/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { MessagingService } from "./messaging.service";

/**
 * Pulls cloud-originated messages (and conversation upserts) into local SQLite
 * so LAN clients (especially techs) see remote authorizer traffic.
 */
@Injectable()
export class MessagingPullService {
  private readonly logger = new Logger(MessagingPullService.name);
  private pulling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
  ) {}

  @Cron(process.env.MESSAGING_PULL_CRON ?? "*/20 * * * * *")
  async pullFromCloud() {
    if (this.pulling) return;
    if (process.env.CLOUD_SYNC_ENABLED === "false") return;

    this.pulling = true;
    try {
      const cloudUrl = process.env.CLOUD_API_URL ?? "http://localhost:3102";
      const meta = await this.prisma.messagingSyncMeta.findUnique({
        where: { id: "singleton" },
      });
      const since =
        meta?.lastCloudPullAt?.toISOString() ??
        new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

      const res = await fetch(
        `${cloudUrl}/sync/messages/pull?since=${encodeURIComponent(since)}`,
        {
          headers: {
            ...(process.env.EDGE_SYNC_TOKEN
              ? { Authorization: `Bearer ${process.env.EDGE_SYNC_TOKEN}` }
              : {}),
          },
        },
      );
      if (!res.ok) {
        if (res.status !== 404) {
          this.logger.warn(`Messaging pull failed: HTTP ${res.status}`);
        }
        return;
      }

      const json = CloudMessagesPullResponseSchema.parse(await res.json());
      for (const conversation of json.conversations) {
        await this.messaging.ingestCloudConversation(
          conversation as ConversationUpsertEventPayload,
        );
      }
      let inserted = 0;
      for (const message of json.messages) {
        const ok = await this.messaging.ingestCloudMessage(
          message as MessageCreatedEventPayload,
        );
        if (ok) inserted += 1;
      }

      const pullAt = json.cursor ? new Date(json.cursor) : new Date();
      await this.prisma.messagingSyncMeta.update({
        where: { id: "singleton" },
        data: { lastCloudPullAt: pullAt },
      });

      if (inserted > 0 || json.conversations.length > 0) {
        this.logger.log(
          `Messaging pull: +${inserted} messages, ${json.conversations.length} conversations`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Messaging pull error: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.pulling = false;
    }
  }
}
