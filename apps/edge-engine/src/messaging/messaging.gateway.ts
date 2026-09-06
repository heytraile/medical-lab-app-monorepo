import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Inject, Logger, forwardRef } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import type { MessagingWsEvent } from "@drax-lis/contracts";
import { CreateMessageRequestSchema } from "@drax-lis/contracts";
import { getCorsOrigins } from "../config/cors-origins";
import { EdgeJwtService } from "../auth/edge-jwt.service";
import { isProductionHardened } from "../config/production-hardening";
import type { AuthUser } from "../auth/auth.guard";
import { MessagingService } from "./messaging.service";

type AuthedSocket = Socket & { data: { user?: AuthUser } };

@WebSocketGateway({
  cors: { origin: getCorsOrigins(), credentials: true },
  namespace: "/messaging",
})
export class MessagingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(MessagingGateway.name);
  /** staffId → set of socket ids */
  private readonly staffSockets = new Map<string, Set<string>>();

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: EdgeJwtService,
    @Inject(forwardRef(() => MessagingService))
    private readonly messaging: MessagingService,
  ) {}

  async handleConnection(client: AuthedSocket) {
    const user = this.authenticate(client);
    if (!user) {
      client.disconnect(true);
      return;
    }
    client.data.user = user;
    this.trackSocket(user.id, client.id);
    client.join(`staff:${user.id}`);
    try {
      const conversationIds = await this.messaging.conversationIdsForStaff(
        user.id,
      );
      for (const id of conversationIds) {
        client.join(`conversation:${id}`);
      }
    } catch (err) {
      this.logger.warn(
        `Failed to join conversation rooms for ${user.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    this.logger.log(`Messaging client connected: ${user.email ?? user.id}`);
  }

  handleDisconnect(client: AuthedSocket) {
    const user = client.data.user;
    if (!user) return;
    const set = this.staffSockets.get(user.id);
    if (set) {
      set.delete(client.id);
      if (set.size === 0) this.staffSockets.delete(user.id);
    }
  }

  @SubscribeMessage("message.send")
  async handleSend(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: unknown,
  ) {
    const user = client.data.user;
    if (!user) return { ok: false, error: "unauthorized" };
    try {
      const parsed = CreateMessageRequestSchema.parse(body);
      const message = await this.messaging.createMessage(user, parsed, "edge");
      return { ok: true, message };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  emitToConversation(conversationId: string, event: MessagingWsEvent) {
    this.server
      ?.to(`conversation:${conversationId}`)
      .emit("messaging.event", event);
  }

  emitToStaff(staffId: string, event: MessagingWsEvent) {
    this.server?.to(`staff:${staffId}`).emit("messaging.event", event);
  }

  joinStaffToConversation(staffId: string, conversationId: string) {
    const sockets = this.staffSockets.get(staffId);
    if (!sockets || !this.server) return;
    for (const socketId of sockets) {
      const sock = this.server.sockets.sockets.get(socketId);
      sock?.join(`conversation:${conversationId}`);
    }
  }

  private trackSocket(staffId: string, socketId: string) {
    let set = this.staffSockets.get(staffId);
    if (!set) {
      set = new Set();
      this.staffSockets.set(staffId, set);
    }
    set.add(socketId);
  }

  private authenticate(client: Socket): AuthUser | null {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      (typeof client.handshake.headers.authorization === "string"
        ? client.handshake.headers.authorization.replace(/^Bearer\s+/i, "")
        : undefined);
    if (!token) return null;

    if (token.startsWith("dev:") && !isProductionHardened()) {
      const role = token.slice(4) as AuthUser["role"];
      if (!["tech", "authorizer", "admin"].includes(role)) return null;
      return {
        id: `dev-${role}`,
        email: `${role}@local.dev`,
        role,
        fullName: `Dev ${role}`,
      };
    }

    const payload = this.jwt.verify(token);
    if (!payload) return null;
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      fullName: payload.fullName,
      jobTitle: payload.jobTitle,
    };
  }
}
