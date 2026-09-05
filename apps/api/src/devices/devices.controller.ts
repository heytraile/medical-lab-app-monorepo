import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { DeviceEnrollRequestSchema } from "@drax-lis/contracts";
import { DevicesService } from "./devices.service";
import { LabDeviceGuard } from "./lab-device.guard";
import {
  CurrentUser,
  Roles,
  SupabaseAuthGuard,
  type AuthUser,
} from "../auth/auth.guard";
import type { DeviceSnapshot } from "@drax-lis/contracts";

@Controller("devices")
@UseGuards(SupabaseAuthGuard)
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  /** One-time: redeem the code an edge admin generated for this staff member. */
  @Post("enroll")
  async enroll(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const parsed = DeviceEnrollRequestSchema.parse(body);
    return this.devices.enrollDevice(user.id, parsed);
  }

  /**
   * Called once by the web app right after Supabase sign-in (with device
   * headers already attached) — this is the "cloud login" audit checkpoint.
   */
  @Post("session")
  async session(
    @CurrentUser() user: AuthUser,
    @Headers("x-lab-device-id") deviceId?: string,
    @Headers("x-lab-device-token") deviceToken?: string,
    @Headers("x-forwarded-for") forwardedFor?: string,
    @Headers("user-agent") userAgent?: string,
  ) {
    let device: DeviceSnapshot | null = null;
    if (deviceId && deviceToken) {
      device = await this.devices.validateDeviceToken(
        deviceId,
        deviceToken,
        user.id,
      );
    }

    await this.devices.recordLoginAttempt({
      device,
      userId: user.id,
      outcome: device ? "success" : "failed_device",
      ip: forwardedFor ?? null,
      userAgent: userAgent ?? null,
    });

    return { ok: Boolean(device), device };
  }

  @Get()
  @UseGuards(LabDeviceGuard)
  @Roles("admin")
  list() {
    return this.devices.listDevices();
  }

  @Post(":id/revoke")
  @UseGuards(LabDeviceGuard)
  @Roles("admin")
  revoke(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.devices.revokeDevice(id, user.id);
  }
}
