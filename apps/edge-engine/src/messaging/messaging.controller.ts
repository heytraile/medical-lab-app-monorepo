import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  CreateChannelRequestSchema,
  CreateDmRequestSchema,
  CreateMessageRequestSchema,
  ListMessagesQuerySchema,
} from "@drax-lis/contracts";
import {
  CurrentUser,
  EdgeAuthGuard,
  Roles,
  type AuthUser,
} from "../auth/auth.guard";
import { MessagingService } from "./messaging.service";

@Controller("messaging")
@UseGuards(EdgeAuthGuard)
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get("conversations")
  listConversations(@CurrentUser() user: AuthUser) {
    return this.messaging.listConversations(user.id);
  }

  @Get("directory")
  directory(@CurrentUser() user: AuthUser) {
    return this.messaging.listStaffDirectory(user.id);
  }

  @Get("conversations/:id")
  getConversation(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.messaging.getConversation(id, user.id);
  }

  @Post("dms")
  createDm(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const parsed = CreateDmRequestSchema.parse(body);
    return this.messaging.createDm(user, parsed);
  }

  @Post("channels")
  @Roles("admin")
  createChannel(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const parsed = CreateChannelRequestSchema.parse(body);
    return this.messaging.createChannel(user, parsed);
  }

  @Get("messages")
  listMessages(
    @Query() query: Record<string, string>,
    @CurrentUser() user: AuthUser,
  ) {
    const parsed = ListMessagesQuerySchema.parse(query);
    return this.messaging.listMessages(parsed.conversationId, user.id, {
      limit: parsed.limit,
      beforeSequence: parsed.beforeSequence,
    });
  }

  @Post("messages")
  createMessage(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const parsed = CreateMessageRequestSchema.parse(body);
    return this.messaging.createMessage(user, parsed, "edge");
  }
}
