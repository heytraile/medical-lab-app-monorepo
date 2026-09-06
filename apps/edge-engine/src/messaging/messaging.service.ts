import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  forwardRef,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  Conversation,
  ConversationMember,
  ConversationUpsertEventPayload,
  CreateChannelRequest,
  CreateDmRequest,
  CreateMessageRequest,
  Message,
  MessageCreatedEventPayload,
} from "@drax-lis/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { SyncService } from "../sync/sync.service";
import type { AuthUser } from "../auth/auth.guard";
import { MessagingGateway } from "./messaging.gateway";

const DEFAULT_CHANNELS: Array<{
  id: string;
  slug: string;
  title: string;
  /** Who gets auto-membership: all | bench (tech+admin) | authorizers (authorizer+admin) */
  membership: "all" | "bench" | "authorizers";
}> = [
  {
    id: "a0000001-0001-4001-8001-000000000001",
    slug: "general",
    title: "#general",
    membership: "all",
  },
  {
    id: "a0000001-0001-4001-8001-000000000002",
    slug: "bench",
    title: "#bench",
    membership: "bench",
  },
  {
    id: "a0000001-0001-4001-8001-000000000003",
    slug: "authorizers",
    title: "#authorizers",
    membership: "authorizers",
  },
];

function staffMatchesMembership(
  role: string,
  membership: "all" | "bench" | "authorizers",
): boolean {
  if (membership === "all") return true;
  if (membership === "bench") return role === "tech" || role === "admin";
  return role === "authorizer" || role === "admin";
}

@Injectable()
export class MessagingService implements OnModuleInit {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: SyncService,
    @Inject(forwardRef(() => MessagingGateway))
    private readonly gateway: MessagingGateway,
  ) {}

  async onModuleInit() {
    await this.ensureMessagingMeta();
    await this.seedDefaultChannels();
  }

  private async ensureMessagingMeta() {
    await this.prisma.messagingSyncMeta.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", nextLocalSequence: 1 },
      update: {},
    });
  }

  private async nextLocalSequence(): Promise<number> {
    const meta = await this.prisma.messagingSyncMeta.update({
      where: { id: "singleton" },
      data: { nextLocalSequence: { increment: 1 } },
    });
    return meta.nextLocalSequence - 1;
  }

  async seedDefaultChannels() {
    const staff = await this.prisma.staff.findMany({
      where: { isActive: true },
    });
    for (const ch of DEFAULT_CHANNELS) {
      const existing = await this.prisma.conversation.findUnique({
        where: { id: ch.id },
      });
      if (!existing) {
        await this.prisma.conversation.create({
          data: {
            id: ch.id,
            kind: "channel",
            slug: ch.slug,
            title: ch.title,
          },
        });
      }
      const eligible = staff.filter((s) =>
        staffMatchesMembership(s.role, ch.membership),
      );
      let membersChanged = !existing;
      for (const s of eligible) {
        const before = await this.prisma.conversationMember.findUnique({
          where: {
            conversationId_staffId: {
              conversationId: ch.id,
              staffId: s.id,
            },
          },
        });
        await this.prisma.conversationMember.upsert({
          where: {
            conversationId_staffId: {
              conversationId: ch.id,
              staffId: s.id,
            },
          },
          create: {
            conversationId: ch.id,
            staffId: s.id,
            role: s.role === "admin" ? "admin" : "member",
          },
          update: {},
        });
        if (!before) membersChanged = true;
      }
      if (membersChanged) {
        await this.enqueueConversationUpsert(ch.id);
      }
    }
    this.logger.log("Default messaging channels seeded");
  }

  /** When new staff are created, add them to matching default channels. */
  async ensureStaffChannelMembership(staffId: string, role: string) {
    for (const ch of DEFAULT_CHANNELS) {
      if (!staffMatchesMembership(role, ch.membership)) continue;
      await this.prisma.conversationMember.upsert({
        where: {
          conversationId_staffId: {
            conversationId: ch.id,
            staffId,
          },
        },
        create: {
          conversationId: ch.id,
          staffId,
          role: role === "admin" ? "admin" : "member",
        },
        update: {},
      });
      await this.enqueueConversationUpsert(ch.id);
    }
  }

  async listConversations(userId: string): Promise<Conversation[]> {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { staffId: userId },
      include: {
        conversation: {
          include: {
            members: true,
            messages: {
              orderBy: { localSequence: "desc" },
              take: 1,
            },
          },
        },
      },
      orderBy: { conversation: { updatedAt: "desc" } },
    });

    const staffIds = new Set<string>();
    for (const m of memberships) {
      for (const mem of m.conversation.members) staffIds.add(mem.staffId);
    }
    const staffRows = await this.prisma.staff.findMany({
      where: { id: { in: [...staffIds] } },
    });
    const staffById = new Map(staffRows.map((s) => [s.id, s]));

    return memberships.map((m) =>
      this.toConversation(m.conversation, staffById),
    );
  }

  async listStaffDirectory(userId: string) {
    const rows = await this.prisma.staff.findMany({
      where: { isActive: true, NOT: { id: userId } },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        cloudLoginAllowed: true,
      },
    });
    return rows;
  }

  async getConversation(
    conversationId: string,
    userId: string,
  ): Promise<Conversation> {
    await this.assertMember(conversationId, userId);
    const conversation = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: {
        members: true,
        messages: { orderBy: { localSequence: "desc" }, take: 1 },
      },
    });
    const staffRows = await this.prisma.staff.findMany({
      where: { id: { in: conversation.members.map((m) => m.staffId) } },
    });
    return this.toConversation(
      conversation,
      new Map(staffRows.map((s) => [s.id, s])),
    );
  }

  async createDm(
    user: AuthUser,
    body: CreateDmRequest,
  ): Promise<Conversation> {
    if (body.otherStaffId === user.id) {
      throw new BadRequestException("Cannot start a DM with yourself");
    }
    const other = await this.prisma.staff.findFirst({
      where: { id: body.otherStaffId, isActive: true },
    });
    if (!other) throw new NotFoundException("Staff member not found");

    const mine = await this.prisma.conversationMember.findMany({
      where: { staffId: user.id, conversation: { kind: "dm" } },
      select: { conversationId: true },
    });
    for (const m of mine) {
      const otherMem = await this.prisma.conversationMember.findUnique({
        where: {
          conversationId_staffId: {
            conversationId: m.conversationId,
            staffId: body.otherStaffId,
          },
        },
      });
      if (otherMem) {
        return this.getConversation(m.conversationId, user.id);
      }
    }

    const id = randomUUID();
    const title = other.fullName;
    await this.prisma.conversation.create({
      data: {
        id,
        kind: "dm",
        slug: null,
        title,
        members: {
          create: [
            { staffId: user.id, role: "member" },
            { staffId: body.otherStaffId, role: "member" },
          ],
        },
      },
    });
    await this.enqueueConversationUpsert(id);
    const conversation = await this.getConversation(id, user.id);
    this.gateway.emitToStaff(user.id, {
      type: "conversation.updated",
      conversation,
    });
    this.gateway.emitToStaff(body.otherStaffId, {
      type: "conversation.updated",
      conversation,
    });
    return conversation;
  }

  async createChannel(
    user: AuthUser,
    body: CreateChannelRequest,
  ): Promise<Conversation> {
    if (user.role !== "admin") {
      throw new ForbiddenException("Only admins can create channels");
    }
    const slug = body.slug.toLowerCase();
    const existing = await this.prisma.conversation.findFirst({
      where: { kind: "channel", slug },
    });
    if (existing) throw new ConflictException(`Channel #${slug} already exists`);

    const id = randomUUID();
    const memberIds = new Set(body.memberStaffIds ?? []);
    memberIds.add(user.id);
    const staff = await this.prisma.staff.findMany({
      where: { id: { in: [...memberIds] }, isActive: true },
    });
    await this.prisma.conversation.create({
      data: {
        id,
        kind: "channel",
        slug,
        title: body.title.startsWith("#") ? body.title : `#${body.title}`,
        members: {
          create: staff.map((s) => ({
            staffId: s.id,
            role: s.id === user.id ? "admin" : "member",
          })),
        },
      },
    });
    await this.enqueueConversationUpsert(id);
    const conversation = await this.getConversation(id, user.id);
    for (const s of staff) {
      this.gateway.emitToStaff(s.id, {
        type: "conversation.updated",
        conversation,
      });
      this.gateway.joinStaffToConversation(s.id, id);
    }
    return conversation;
  }

  async listMessages(
    conversationId: string,
    userId: string,
    opts: { limit?: number; beforeSequence?: number } = {},
  ): Promise<Message[]> {
    await this.assertMember(conversationId, userId);
    const limit = opts.limit ?? 100;
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(opts.beforeSequence != null
          ? { localSequence: { lt: opts.beforeSequence } }
          : {}),
      },
      orderBy: { localSequence: "desc" },
      take: limit,
    });
    const senderIds = [...new Set(rows.map((r) => r.senderStaffId))];
    const senders = await this.prisma.staff.findMany({
      where: { id: { in: senderIds } },
    });
    const byId = new Map(senders.map((s) => [s.id, s]));
    return rows
      .reverse()
      .map((r) => this.toMessage(r, byId.get(r.senderStaffId)?.fullName ?? null));
  }

  async createMessage(
    user: AuthUser,
    body: CreateMessageRequest,
    origin: "edge" | "cloud" = "edge",
  ): Promise<Message> {
    await this.assertMember(body.conversationId, user.id);
    const existing = await this.prisma.message.findUnique({
      where: { id: body.id },
    });
    if (existing) {
      const sender = await this.prisma.staff.findUnique({
        where: { id: existing.senderStaffId },
      });
      return this.toMessage(existing, sender?.fullName ?? null);
    }

    const localSequence = await this.nextLocalSequence();
    const createdAt = body.createdAt ? new Date(body.createdAt) : new Date();
    const row = await this.prisma.message.create({
      data: {
        id: body.id,
        conversationId: body.conversationId,
        senderStaffId: user.id,
        body: body.body.trim(),
        createdAt,
        localSequence,
        synced: origin === "cloud" ? "synced" : "pending",
        origin,
      },
    });
    await this.prisma.conversation.update({
      where: { id: body.conversationId },
      data: { updatedAt: new Date() },
    });

    const message = this.toMessage(row, user.fullName ?? null);
    this.gateway.emitToConversation(body.conversationId, {
      type: "message.created",
      message,
    });

    if (origin === "edge") {
      await this.enqueueMessageCreated(row);
    }
    return message;
  }

  /** Insert a message pulled from cloud (idempotent). */
  async ingestCloudMessage(payload: MessageCreatedEventPayload): Promise<boolean> {
    const existing = await this.prisma.message.findUnique({
      where: { id: payload.messageId },
    });
    if (existing) return false;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: payload.conversationId },
    });
    if (!conversation) {
      this.logger.warn(
        `Skipping cloud message ${payload.messageId}: conversation ${payload.conversationId} missing locally`,
      );
      return false;
    }

    const row = await this.prisma.message.create({
      data: {
        id: payload.messageId,
        conversationId: payload.conversationId,
        senderStaffId: payload.senderStaffId,
        body: payload.body,
        createdAt: new Date(payload.createdAt),
        localSequence: payload.localSequence,
        synced: "synced",
        origin: "cloud",
      },
    });
    await this.prisma.conversation.update({
      where: { id: payload.conversationId },
      data: { updatedAt: new Date() },
    });

    const sender = await this.prisma.staff.findUnique({
      where: { id: payload.senderStaffId },
    });
    const message = this.toMessage(row, sender?.fullName ?? null);
    this.gateway.emitToConversation(payload.conversationId, {
      type: "message.created",
      message,
    });
    return true;
  }

  async ingestCloudConversation(
    payload: ConversationUpsertEventPayload,
  ): Promise<void> {
    await this.prisma.conversation.upsert({
      where: { id: payload.conversationId },
      create: {
        id: payload.conversationId,
        kind: payload.kind,
        slug: payload.slug ?? null,
        title: payload.title,
        createdAt: new Date(payload.createdAt),
        updatedAt: new Date(payload.updatedAt),
      },
      update: {
        title: payload.title,
        slug: payload.slug ?? null,
        updatedAt: new Date(payload.updatedAt),
      },
    });
    for (const m of payload.members) {
      await this.prisma.conversationMember.upsert({
        where: {
          conversationId_staffId: {
            conversationId: payload.conversationId,
            staffId: m.staffId,
          },
        },
        create: {
          conversationId: payload.conversationId,
          staffId: m.staffId,
          role: m.role,
        },
        update: { role: m.role },
      });
      this.gateway.joinStaffToConversation(m.staffId, payload.conversationId);
    }
  }

  async markMessagesSynced(messageIds: string[]) {
    if (!messageIds.length) return;
    await this.prisma.message.updateMany({
      where: { id: { in: messageIds } },
      data: { synced: "synced" },
    });
  }

  async conversationIdsForStaff(staffId: string): Promise<string[]> {
    const rows = await this.prisma.conversationMember.findMany({
      where: { staffId },
      select: { conversationId: true },
    });
    return rows.map((r) => r.conversationId);
  }

  private async assertMember(conversationId: string, staffId: string) {
    const mem = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_staffId: { conversationId, staffId },
      },
    });
    if (!mem) throw new ForbiddenException("Not a member of this conversation");
  }

  private async enqueueConversationUpsert(conversationId: string) {
    const conversation = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: { members: true },
    });
    const payload: ConversationUpsertEventPayload = {
      conversationId: conversation.id,
      kind: conversation.kind as "dm" | "channel",
      slug: conversation.slug,
      title: conversation.title,
      members: conversation.members.map((m) => ({
        staffId: m.staffId,
        role: m.role as "member" | "admin",
      })),
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    };
    await this.sync.enqueue({
      type: "conversation.upsert",
      payload: payload as unknown as Record<string, unknown>,
    });
  }

  private async enqueueMessageCreated(row: {
    id: string;
    conversationId: string;
    senderStaffId: string;
    body: string;
    createdAt: Date;
    localSequence: number;
    origin: string;
  }) {
    const payload: MessageCreatedEventPayload = {
      messageId: row.id,
      conversationId: row.conversationId,
      senderStaffId: row.senderStaffId,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      localSequence: row.localSequence,
      origin: row.origin as "edge" | "cloud",
      edgeNodeId: process.env.EDGE_NODE_ID ?? "edge-unknown",
    };
    await this.sync.enqueue({
      type: "message.created",
      payload: payload as unknown as Record<string, unknown>,
    });
  }

  private toConversation(
    conversation: {
      id: string;
      kind: string;
      slug: string | null;
      title: string;
      createdAt: Date;
      updatedAt: Date;
      members: Array<{ staffId: string; role: string }>;
      messages: Array<{ body: string; createdAt: Date }>;
    },
    staffById: Map<
      string,
      { id: string; fullName: string; email: string; role: string }
    >,
  ): Conversation {
    const last = conversation.messages[0];
    const members: ConversationMember[] = conversation.members.map((m) => {
      const s = staffById.get(m.staffId);
      return {
        staffId: m.staffId,
        role: m.role as "member" | "admin",
        fullName: s?.fullName ?? null,
        email: s?.email ?? null,
        staffRole: (s?.role as ConversationMember["staffRole"]) ?? null,
      };
    });
    return {
      id: conversation.id,
      kind: conversation.kind as "dm" | "channel",
      slug: conversation.slug,
      title: conversation.title,
      members,
      lastMessageAt: last?.createdAt.toISOString() ?? null,
      lastMessagePreview: last?.body?.slice(0, 120) ?? null,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    };
  }

  private toMessage(
    row: {
      id: string;
      conversationId: string;
      senderStaffId: string;
      body: string;
      createdAt: Date;
      localSequence: number;
      synced: string;
      origin: string;
    },
    senderFullName: string | null,
  ): Message {
    return {
      id: row.id,
      conversationId: row.conversationId,
      senderStaffId: row.senderStaffId,
      senderFullName,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      localSequence: row.localSequence,
      synced: row.synced as Message["synced"],
      origin: row.origin as Message["origin"],
    };
  }
}
