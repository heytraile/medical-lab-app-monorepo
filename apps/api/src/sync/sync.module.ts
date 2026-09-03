import { Module } from "@nestjs/common";
import { SyncController } from "./sync.controller";
import { CloudReadController } from "./cloud.controller";
import { SyncService } from "./sync.service";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { ReportsService } from "../reports/reports.service";
import { MailService } from "../reports/mail.service";

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [SyncController, CloudReadController],
  providers: [SyncService, ReportsService, MailService],
  exports: [SyncService, ReportsService],
})
export class SyncModule {}
