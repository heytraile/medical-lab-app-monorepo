import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { DeviceSnapshot } from "@drax-lis/contracts";
import { DevicesService } from "./devices.service";
import type { AuthUser } from "../auth/auth.guard";

/**
 * Cloud login always requires a lab-issued device (see docs/EDGE_AUTH_AND_STAFF.md).
 * Must run AFTER SupabaseAuthGuard — reads `req.user` it sets, plus the
 * `X-Lab-Device-Id` / `X-Lab-Device-Token` headers the browser sends on
 * every cloud API call once a device is enrolled.
 */
@Injectable()
export class LabDeviceGuard implements CanActivate {
  constructor(private readonly devices: DevicesService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AuthUser;
      device?: DeviceSnapshot;
    }>();

    const deviceId = req.headers["x-lab-device-id"];
    const deviceToken = req.headers["x-lab-device-token"];
    if (!req.user) {
      throw new UnauthorizedException("Not authenticated");
    }
    if (!deviceId || !deviceToken) {
      throw new UnauthorizedException(
        "This browser is not enrolled as a lab device — enter your lab enrollment code",
      );
    }

    const device = await this.devices.validateDeviceToken(
      deviceId,
      deviceToken,
      req.user.id,
    );
    if (!device) {
      throw new UnauthorizedException(
        "Device not recognized or revoked — re-enroll this browser",
      );
    }

    req.device = device;
    return true;
  }
}

export const CurrentDevice = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): DeviceSnapshot | undefined => {
    const req = ctx
      .switchToHttp()
      .getRequest<{ device?: DeviceSnapshot }>();
    return req.device;
  },
);
