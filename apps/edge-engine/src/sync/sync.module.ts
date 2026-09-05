import { Module } from "@nestjs/common";
import { SyncService } from "./sync.service";
import { SyncController } from "./sync.controller";
import { BackupModule } from "../backup/backup.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [BackupModule, AuthModule],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
