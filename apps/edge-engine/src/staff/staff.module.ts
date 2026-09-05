import { Module } from "@nestjs/common";
import { StaffController } from "./staff.controller";
import { StaffService } from "./staff.service";
import { AuthController } from "./auth.controller";
import { DeviceEnrollmentService } from "./device-enrollment.service";
import { StaffSeedService } from "./staff-seed.service";
import { AuthModule } from "../auth/auth.module";
import { SyncModule } from "../sync/sync.module";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [AuthModule, SyncModule, AuditModule],
  controllers: [StaffController, AuthController],
  providers: [StaffService, DeviceEnrollmentService, StaffSeedService],
  exports: [StaffService],
})
export class StaffModule {}
