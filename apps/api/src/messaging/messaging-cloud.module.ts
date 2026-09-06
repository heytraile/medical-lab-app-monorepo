import { Module } from "@nestjs/common";
import { MessagingCloudService } from "./messaging-cloud.service";
import { MessagingCloudController } from "./messaging-cloud.controller";
import { AuthModule } from "../auth/auth.module";
import { DevicesModule } from "../devices/devices.module";

@Module({
  imports: [AuthModule, DevicesModule],
  controllers: [MessagingCloudController],
  providers: [MessagingCloudService],
  exports: [MessagingCloudService],
})
export class MessagingCloudModule {}
