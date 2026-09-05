import { Body, Controller, Headers, Post } from "@nestjs/common";
import { assertEdgeSyncToken } from "./sync.service";
import { DevicesService } from "../devices/devices.service";

type DeviceEnrollmentCodePush = {
  code: string;
  assignToStaffId: string;
  createdByStaffId: string;
  deviceLabel?: string;
  expiresAt: string;
};

/**
 * Edge pushes a freshly generated enrollment code here immediately (same
 * trust boundary as outbox sync: EDGE_SYNC_TOKEN bearer). The cloud is the
 * one place that can validate the code when the browser redeems it.
 */
@Controller("sync")
export class DeviceEnrollmentCodesController {
  constructor(private readonly devices: DevicesService) {}

  @Post("device-enrollment-codes")
  async push(
    @Body() body: DeviceEnrollmentCodePush,
    @Headers("authorization") authorization?: string,
  ) {
    assertEdgeSyncToken(authorization);
    await this.devices.storeEnrollmentCode(body);
    return { ok: true };
  }
}
