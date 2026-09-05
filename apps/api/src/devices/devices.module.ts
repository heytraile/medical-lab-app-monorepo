import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DevicesController } from "./devices.controller";
import { DevicesService } from "./devices.service";
import { LabDeviceGuard } from "./lab-device.guard";

@Module({
  imports: [AuthModule],
  controllers: [DevicesController],
  providers: [DevicesService, LabDeviceGuard],
  exports: [DevicesService, LabDeviceGuard],
})
export class DevicesModule {}
