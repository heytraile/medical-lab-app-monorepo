import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  CreateMessageRequestSchema,
  ListMessagesQuerySchema,
} from "@drax-lis/contracts";
import {
  CurrentUser,
  Roles,
  SupabaseAuthGuard,
  type AuthUser,
} from "../auth/auth.guard";
import { LabDeviceGuard } from "../devices/lab-device.guard";
import { MessagingCloudService } from "./messaging-cloud.service";

@Controller("cloud/messaging")
@UseGuards(SupabaseAuthGuard)
export class MessagingCloudController {
  constructor(private readonly messaging: MessagingCloudService) {}

  @Get("conversations")
  @Roles("authorizer", "admin")
  listConversations(@CurrentUser() user: AuthUser) {
    return this.messaging.listConversationsForUser(user.id);
  }

  @Get("messages")
  @Roles("authorizer", "admin")
  listMessages(
    @Query() query: Record<string, string>,
    @CurrentUser() user: AuthUser,
  ) {
    const parsed = ListMessagesQuerySchema.parse(query);
    return this.messaging.listMessages(
      parsed.conversationId,
      user.id,
      parsed.limit,
    );
  }

  @Post("messages")
  @UseGuards(LabDeviceGuard)
  @Roles("authorizer", "admin")
  createMessage(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const parsed = CreateMessageRequestSchema.parse(body);
    return this.messaging.createMessage(user, parsed);
  }
}
