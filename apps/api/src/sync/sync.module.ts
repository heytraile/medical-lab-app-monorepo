import { Module } from "@nestjs/common";
import { SyncController } from "./sync.controller";
import { CloudReadController } from "./cloud.controller";
import { SyncService } from "./sync.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [SyncController, CloudReadController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
