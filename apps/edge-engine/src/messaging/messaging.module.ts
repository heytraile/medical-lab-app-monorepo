import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SyncModule } from "../sync/sync.module";
import { MessagingController } from "./messaging.controller";
import { MessagingService } from "./messaging.service";
import { MessagingGateway } from "./messaging.gateway";
import { MessagingPullService } from "./messaging-pull.service";

@Module({
  imports: [AuthModule, SyncModule],
  controllers: [MessagingController],
  providers: [MessagingService, MessagingGateway, MessagingPullService],
  exports: [MessagingService, MessagingGateway],
})
export class MessagingModule {}
