import { Module } from "@nestjs/common";
import { SyncController } from "./sync.controller";
import { CloudReadController } from "./cloud.controller";
import { DeviceEnrollmentCodesController } from "./device-enrollment-codes.controller";
import { SyncService } from "./sync.service";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { ReportsService } from "../reports/reports.service";
import { MailService } from "../reports/mail.service";
import { LabStaffModule } from "../lab-staff/lab-staff.module";
import { DevicesModule } from "../devices/devices.module";
import { MessagingCloudModule } from "../messaging/messaging-cloud.module";

@Module({
  imports: [
    AuthModule,
    AuditModule,
    LabStaffModule,
    DevicesModule,
    MessagingCloudModule,
  ],
  controllers: [
    SyncController,
    CloudReadController,
    DeviceEnrollmentCodesController,
  ],
  providers: [SyncService, ReportsService, MailService],
  exports: [SyncService, ReportsService],
})
export class SyncModule {}
