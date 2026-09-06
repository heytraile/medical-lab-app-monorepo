import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { DRAX_HALL_LAB } from "@drax-lis/catalog";
import type {
  Conversation,
  ConversationUpsertEventPayload,
  CreateMessageRequest,
  Message,
  MessageCreatedEventPayload,
} from "@drax-lis/contracts";
import { SupabaseService } from "../supabase/supabase.module";
import type { AuthUser } from "../auth/auth.guard";

@Injectable()
export class MessagingCloudService {
  private readonly logger = new Logger(MessagingCloudService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async projectConversationUpsert(
    payload: ConversationUpsertEventPayload,
  ): Promise<void> {
    if (!this.supabase.enabled || !this.supabase.client) {
      this.logger.debug(
        `conversation.upsert (memory skip): ${payload.conversationId}`,
      );
      return;
    }
    const client = this.supabase.client;
    const { error } = await client.from("conversations").upsert(
      {
        id: payload.conversationId,
        lab_id: DRAX_HALL_LAB.id,
        kind: payload.kind,
        slug: payload.slug ?? null,
        title: payload.title,
        created_at: payload.createdAt,
        updated_at: payload.updatedAt,
      },
      { onConflict: "id" },
    );
    if (error) throw error;

    for (const m of payload.members) {
      const { error: memErr } = await client.from("conversation_members").upsert(
        {
          conversation_id: payload.conversationId,
          staff_id: m.staffId,
          role: m.role,
        },
        { onConflict: "conversation_id,staff_id" },
      );
      if (memErr) {
        // Profile may not exist yet for brand-new staff — log and continue.
        this.logger.warn(
          `conversation_members upsert failed for ${m.staffId}: ${memErr.message}`,
        );
      }
    }
  }

  async projectMessageCreated(
    payload: MessageCreatedEventPayload,
  ): Promise<void> {
    if (!this.supabase.enabled || !this.supabase.client) {
      this.logger.debug(`message.created (memory skip): ${payload.messageId}`);
      return;
    }
    const client = this.supabase.client;
    const { error } = await client.from("messages").upsert(
      {
        id: payload.messageId,
        conversation_id: payload.conversationId,
        sender_staff_id: payload.senderStaffId,
        body: payload.body,
        created_at: payload.createdAt,
        local_sequence: payload.localSequence,
        origin: payload.origin ?? "edge",
        edge_node_id: payload.edgeNodeId ?? null,
        synced_from_edge_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) throw error;

    await client
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", payload.conversationId);
  }

  async pullSince(sinceIso: string): Promise<{
    conversations: ConversationUpsertEventPayload[];
    messages: MessageCreatedEventPayload[];
    cursor: string | null;
  }> {
    if (!this.supabase.enabled || !this.supabase.client) {
      return { conversations: [], messages: [], cursor: sinceIso };
    }
    const client = this.supabase.client;
    const since = sinceIso || new Date(0).toISOString();

    const { data: convRows, error: convErr } = await client
      .from("conversations")
      .select("id, kind, slug, title, created_at, updated_at")
      .gt("updated_at", since)
      .order("updated_at", { ascending: true })
      .limit(100);
    if (convErr) throw convErr;

    const conversations: ConversationUpsertEventPayload[] = [];
    for (const c of convRows ?? []) {
      const { data: members } = await client
        .from("conversation_members")
        .select("staff_id, role")
        .eq("conversation_id", c.id as string);
      conversations.push({
        conversationId: c.id as string,
        kind: c.kind as "dm" | "channel",
        slug: (c.slug as string | null) ?? null,
        title: c.title as string,
        members: (members ?? []).map((m) => ({
          staffId: m.staff_id as string,
          role: m.role as "member" | "admin",
        })),
        createdAt: c.created_at as string,
        updatedAt: c.updated_at as string,
      });
    }

    const { data: msgRows, error: msgErr } = await client
      .from("messages")
      .select(
        "id, conversation_id, sender_staff_id, body, created_at, local_sequence, origin, edge_node_id, inserted_at",
      )
      .gt("inserted_at", since)
      .eq("origin", "cloud")
      .order("inserted_at", { ascending: true })
      .limit(200);
    if (msgErr) throw msgErr;

    const messages: MessageCreatedEventPayload[] = (msgRows ?? []).map((m) => ({
      messageId: m.id as string,
      conversationId: m.conversation_id as string,
      senderStaffId: m.sender_staff_id as string,
      body: m.body as string,
      createdAt: m.created_at as string,
      localSequence: Number(m.local_sequence ?? 0),
      origin: "cloud" as const,
      edgeNodeId: (m.edge_node_id as string | null) ?? null,
    }));

    let cursor = since;
    for (const c of conversations) {
      if (c.updatedAt > cursor) cursor = c.updatedAt;
    }
    for (const m of msgRows ?? []) {
      const inserted = m.inserted_at as string;
      if (inserted > cursor) cursor = inserted;
    }

    return { conversations, messages, cursor };
  }

  async listConversationsForUser(userId: string): Promise<Conversation[]> {
    if (!this.supabase.enabled || !this.supabase.client) return [];
    const client = this.supabase.client;
    const { data: memberships, error } = await client
      .from("conversation_members")
      .select("conversation_id")
      .eq("staff_id", userId);
    if (error) throw error;
    const ids = (memberships ?? []).map((m) => m.conversation_id as string);
    if (!ids.length) return [];

    const { data: rows, error: cErr } = await client
      .from("conversations")
      .select("id, kind, slug, title, created_at, updated_at")
      .in("id", ids)
      .order("updated_at", { ascending: false });
    if (cErr) throw cErr;

    const out: Conversation[] = [];
    for (const c of rows ?? []) {
      const { data: members } = await client
        .from("conversation_members")
        .select("staff_id, role")
        .eq("conversation_id", c.id as string);
      const memberStaffIds = (members ?? []).map((m) => m.staff_id as string);
      const { data: profiles } = memberStaffIds.length
        ? await client
            .from("profiles")
            .select("id, full_name, email, role")
            .in("id", memberStaffIds)
        : { data: [] as Array<Record<string, unknown>> };
      const profileById = new Map(
        (profiles ?? []).map((p) => [p.id as string, p]),
      );
      const { data: lastMsgs } = await client
        .from("messages")
        .select("body, created_at")
        .eq("conversation_id", c.id as string)
        .order("created_at", { ascending: false })
        .limit(1);
      const last = lastMsgs?.[0];
      out.push({
        id: c.id as string,
        kind: c.kind as "dm" | "channel",
        slug: (c.slug as string | null) ?? null,
        title: c.title as string,
        members: (members ?? []).map((m) => {
          const p = profileById.get(m.staff_id as string);
          return {
            staffId: m.staff_id as string,
            role: m.role as "member" | "admin",
            fullName: (p?.full_name as string | null | undefined) ?? null,
            email: (p?.email as string | null | undefined) ?? null,
            staffRole:
              (p?.role as Conversation["members"][0]["staffRole"]) ?? null,
          };
        }),
        lastMessageAt: (last?.created_at as string | undefined) ?? null,
        lastMessagePreview:
          (last?.body as string | undefined)?.slice(0, 120) ?? null,
        createdAt: c.created_at as string,
        updatedAt: c.updated_at as string,
      });
    }
    return out;
  }

  async listMessages(
    conversationId: string,
    userId: string,
    limit = 100,
  ): Promise<Message[]> {
    await this.assertMember(conversationId, userId);
    if (!this.supabase.enabled || !this.supabase.client) return [];
    const client = this.supabase.client;
    const { data, error } = await client
      .from("messages")
      .select(
        "id, conversation_id, sender_staff_id, body, created_at, local_sequence, origin",
      )
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw error;
    const senderIds = [
      ...new Set((data ?? []).map((m) => m.sender_staff_id as string)),
    ];
    const { data: profiles } = senderIds.length
      ? await client
          .from("profiles")
          .select("id, full_name")
          .in("id", senderIds)
      : { data: [] as Array<{ id: string; full_name: string | null }> };
    const nameById = new Map(
      (profiles ?? []).map((p) => [p.id as string, p.full_name as string | null]),
    );
    return (data ?? []).map((m) => ({
      id: m.id as string,
      conversationId: m.conversation_id as string,
      senderStaffId: m.sender_staff_id as string,
      senderFullName: nameById.get(m.sender_staff_id as string) ?? null,
      body: m.body as string,
      createdAt: m.created_at as string,
      localSequence: Number(m.local_sequence ?? 0),
      synced: "synced" as const,
      origin: (m.origin as "edge" | "cloud") ?? "cloud",
    }));
  }

  async createMessage(
    user: AuthUser,
    body: CreateMessageRequest,
  ): Promise<Message> {
    await this.assertMember(body.conversationId, user.id);
    if (!this.supabase.enabled || !this.supabase.client) {
      throw new NotFoundException("Supabase not configured");
    }
    const client = this.supabase.client;
    const createdAt = body.createdAt ?? new Date().toISOString();
    const { data: existing } = await client
      .from("messages")
      .select("id, conversation_id, sender_staff_id, body, created_at, local_sequence, origin")
      .eq("id", body.id)
      .maybeSingle();
    if (existing) {
      return {
        id: existing.id as string,
        conversationId: existing.conversation_id as string,
        senderStaffId: existing.sender_staff_id as string,
        senderFullName: user.fullName ?? null,
        body: existing.body as string,
        createdAt: existing.created_at as string,
        localSequence: Number(existing.local_sequence ?? 0),
        synced: "synced",
        origin: (existing.origin as "edge" | "cloud") ?? "cloud",
      };
    }

    const { error } = await client.from("messages").insert({
      id: body.id,
      conversation_id: body.conversationId,
      sender_staff_id: user.id,
      body: body.body.trim(),
      created_at: createdAt,
      local_sequence: Date.now(),
      origin: "cloud",
    });
    if (error) throw error;

    await client
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", body.conversationId);

    return {
      id: body.id,
      conversationId: body.conversationId,
      senderStaffId: user.id,
      senderFullName: user.fullName ?? null,
      body: body.body.trim(),
      createdAt,
      localSequence: Date.now(),
      synced: "synced",
      origin: "cloud",
    };
  }

  private async assertMember(conversationId: string, userId: string) {
    if (!this.supabase.enabled || !this.supabase.client) {
      throw new ForbiddenException("Not a member of this conversation");
    }
    const { data } = await this.supabase.client
      .from("conversation_members")
      .select("staff_id")
      .eq("conversation_id", conversationId)
      .eq("staff_id", userId)
      .maybeSingle();
    if (!data) throw new ForbiddenException("Not a member of this conversation");
  }
}
