import { z } from "zod";

export const ConversationKindSchema = z.enum(["dm", "channel"]);
export type ConversationKind = z.infer<typeof ConversationKindSchema>;

export const ConversationMemberRoleSchema = z.enum(["member", "admin"]);
export type ConversationMemberRole = z.infer<
  typeof ConversationMemberRoleSchema
>;

export const MessageOriginSchema = z.enum(["edge", "cloud"]);
export type MessageOrigin = z.infer<typeof MessageOriginSchema>;

export const MessageSyncStatusSchema = z.enum([
  "pending",
  "synced",
  "failed",
]);
export type MessageSyncStatus = z.infer<typeof MessageSyncStatusSchema>;

export const ConversationMemberSchema = z.object({
  staffId: z.string().uuid(),
  fullName: z.string().optional().nullable(),
  role: ConversationMemberRoleSchema.default("member"),
  email: z.string().email().optional().nullable(),
  staffRole: z.enum(["tech", "authorizer", "admin"]).optional().nullable(),
});
export type ConversationMember = z.infer<typeof ConversationMemberSchema>;

export const ConversationSchema = z.object({
  id: z.string().uuid(),
  kind: ConversationKindSchema,
  slug: z.string().nullable().optional(),
  title: z.string(),
  members: z.array(ConversationMemberSchema).default([]),
  lastMessageAt: z.string().datetime().nullable().optional(),
  lastMessagePreview: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const MessageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  senderStaffId: z.string().uuid(),
  senderFullName: z.string().nullable().optional(),
  body: z.string().min(1).max(8000),
  createdAt: z.string().datetime(),
  localSequence: z.number().int().nonnegative(),
  synced: MessageSyncStatusSchema.default("pending"),
  origin: MessageOriginSchema.default("edge"),
});
export type Message = z.infer<typeof MessageSchema>;

export const CreateDmRequestSchema = z.object({
  otherStaffId: z.string().uuid(),
});
export type CreateDmRequest = z.infer<typeof CreateDmRequestSchema>;

export const CreateChannelRequestSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9][a-z0-9_-]*$/),
  title: z.string().min(1).max(80),
  memberStaffIds: z.array(z.string().uuid()).optional(),
});
export type CreateChannelRequest = z.infer<typeof CreateChannelRequestSchema>;

export const CreateMessageRequestSchema = z.object({
  /** Client-generated UUID — primary key for idempotent sync. */
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  body: z.string().min(1).max(8000),
  createdAt: z.string().datetime().optional(),
});
export type CreateMessageRequest = z.infer<typeof CreateMessageRequestSchema>;

export const ListMessagesQuerySchema = z.object({
  conversationId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
  beforeSequence: z.coerce.number().int().nonnegative().optional(),
});
export type ListMessagesQuery = z.infer<typeof ListMessagesQuerySchema>;

/** Outbox / sync payload for a conversation + members. */
export const ConversationUpsertEventPayloadSchema = z.object({
  conversationId: z.string().uuid(),
  kind: ConversationKindSchema,
  slug: z.string().nullable().optional(),
  title: z.string(),
  members: z.array(
    z.object({
      staffId: z.string().uuid(),
      role: ConversationMemberRoleSchema.default("member"),
    }),
  ),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ConversationUpsertEventPayload = z.infer<
  typeof ConversationUpsertEventPayloadSchema
>;

/** Outbox / sync payload for a single message. */
export const MessageCreatedEventPayloadSchema = z.object({
  messageId: z.string().uuid(),
  conversationId: z.string().uuid(),
  senderStaffId: z.string().uuid(),
  body: z.string(),
  createdAt: z.string().datetime(),
  localSequence: z.number().int().nonnegative(),
  origin: MessageOriginSchema.default("edge"),
  edgeNodeId: z.string().optional().nullable(),
});
export type MessageCreatedEventPayload = z.infer<
  typeof MessageCreatedEventPayloadSchema
>;

/** Socket.IO / client realtime envelopes. */
export const MessagingWsEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message.created"),
    message: MessageSchema,
  }),
  z.object({
    type: z.literal("conversation.updated"),
    conversation: ConversationSchema,
  }),
  z.object({
    type: z.literal("message.acked"),
    messageId: z.string().uuid(),
  }),
]);
export type MessagingWsEvent = z.infer<typeof MessagingWsEventSchema>;

export const CloudMessagesPullResponseSchema = z.object({
  conversations: z.array(ConversationUpsertEventPayloadSchema).default([]),
  messages: z.array(MessageCreatedEventPayloadSchema).default([]),
  cursor: z.string().datetime().nullable(),
});
export type CloudMessagesPullResponse = z.infer<
  typeof CloudMessagesPullResponseSchema
>;
