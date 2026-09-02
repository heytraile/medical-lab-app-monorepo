import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LabStaffController } from "./lab-staff.controller";
import { LabStaffService } from "./lab-staff.service";

@Module({
  imports: [AuthModule],
  controllers: [LabStaffController],
  providers: [LabStaffService],
})
export class LabStaffModule {}
