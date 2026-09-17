import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AcknowledgeUnidentifiedRequestSchema } from "@drax-lis/contracts";
import { IngestionService } from "./ingestion.service";
import { HardenedAuthGuard } from "../auth/hardened-auth.guard";
import {
  CurrentUser,
  EdgeAuthGuard,
  toActorSnapshot,
  type AuthUser,
} from "../auth/auth.guard";

@Controller("raw-messages")
export class RawMessagesController {
  constructor(private readonly ingestion: IngestionService) {}

  @Get("unidentified")
  @UseGuards(HardenedAuthGuard)
  listUnidentified() {
    return this.ingestion.listUnidentified();
  }

  @Post(":id/acknowledge")
  @UseGuards(EdgeAuthGuard)
  acknowledge(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
  ) {
    const parsed = AcknowledgeUnidentifiedRequestSchema.parse(body);
    return this.ingestion.acknowledgeUnidentified(
      id,
      toActorSnapshot(user),
      parsed.reason,
    );
  }
}
