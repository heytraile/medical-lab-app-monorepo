import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LabStaffController } from "./lab-staff.controller";
import { LabStaffService } from "./lab-staff.service";
import { StaffProvisioningService } from "./staff-provisioning.service";

@Module({
  imports: [AuthModule],
  controllers: [LabStaffController],
  providers: [LabStaffService, StaffProvisioningService],
  exports: [StaffProvisioningService],
})
export class LabStaffModule {}
