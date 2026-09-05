import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { DRAX_HALL_LAB } from "@drax-lis/catalog";
import type {
  DeviceEnrollRequest,
  DeviceEnrollResponse,
  DeviceSnapshot,
  LabDevice,
} from "@drax-lis/contracts";
import { SupabaseService } from "../supabase/supabase.module";

export type DeviceLoginOutcome =
  | "success"
  | "failed_password"
  | "failed_device"
  | "failed_role"
  | "revoked_device";

type LabDeviceRow = {
  id: string;
  name: string;
  owner_staff_id: string;
  owner_full_name?: string | null;
  issued_by_staff_id: string | null;
  status: "active" | "revoked";
  registered_at: string;
  last_login_at: string | null;
  last_seen_at: string | null;
  token_hash?: string;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * Lab-issued cloud device registry: enrollment, validation, revocation, and
 * the append-only login log. See docs/EDGE_AUTH_AND_STAFF.md.
 */
@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(private readonly supabase: SupabaseService) {}

  private get client() {
    if (!this.supabase.enabled || !this.supabase.client) {
      throw new BadRequestException(
        "Device management requires Supabase (cloud API)",
      );
    }
    return this.supabase.client;
  }

  /** Called by POST /sync/device-enrollment-codes (edge push, EDGE_SYNC_TOKEN). */
  async storeEnrollmentCode(input: {
    code: string;
    assignToStaffId: string;
    createdByStaffId: string;
    deviceLabel?: string;
    expiresAt: string;
  }): Promise<void> {
    const { error } = await this.client.from("device_enrollment_codes").insert({
      code_hash: hashCode(input.code),
      lab_id: DRAX_HALL_LAB.id,
      created_by: input.createdByStaffId,
      assign_to_staff_id: input.assignToStaffId,
      device_label: input.deviceLabel ?? null,
      expires_at: input.expiresAt,
    });
    if (error) throw error;
  }

  /** POST /devices/enroll — browser redeems the one-time code. */
  async enrollDevice(
    userId: string,
    body: DeviceEnrollRequest,
  ): Promise<DeviceEnrollResponse> {
    const codeHash = hashCode(body.code.trim().toUpperCase());
    const { data: codeRow, error } = await this.client
      .from("device_enrollment_codes")
      .select("id, assign_to_staff_id, created_by, expires_at, used_at")
      .eq("code_hash", codeHash)
      .maybeSingle();

    if (error) throw error;
    if (!codeRow) {
      throw new BadRequestException("Invalid enrollment code");
    }
    if (codeRow.used_at) {
      throw new BadRequestException("This code has already been used");
    }
    if (new Date(codeRow.expires_at as string).getTime() < Date.now()) {
      throw new BadRequestException("This code has expired — generate a new one");
    }
    if (codeRow.assign_to_staff_id !== userId) {
      throw new ForbiddenException(
        "This code was issued to a different staff member",
      );
    }

    const deviceId = randomUUID();
    const deviceToken = randomBytes(32).toString("hex");

    const { error: insertErr } = await this.client.from("lab_devices").insert({
      id: deviceId,
      lab_id: DRAX_HALL_LAB.id,
      name: body.deviceName.trim(),
      token_hash: hashToken(deviceToken),
      owner_staff_id: userId,
      issued_by_staff_id: (codeRow.created_by as string | null) ?? null,
      status: "active",
    });
    if (insertErr) throw insertErr;

    await this.client
      .from("device_enrollment_codes")
      .update({ used_at: new Date().toISOString(), used_by_device_id: deviceId })
      .eq("id", codeRow.id as string);

    return {
      deviceId,
      deviceToken,
      deviceName: body.deviceName.trim(),
      ownerStaffId: userId,
    };
  }

  /** Validates X-Lab-Device-Id / X-Lab-Device-Token against the owner. Never throws. */
  async validateDeviceToken(
    deviceId: string,
    token: string,
    ownerStaffId: string,
  ): Promise<DeviceSnapshot | null> {
    const { data, error } = await this.client
      .from("lab_devices")
      .select(
        "id, name, owner_staff_id, issued_by_staff_id, status, token_hash",
      )
      .eq("id", deviceId)
      .maybeSingle();
    if (error || !data) return null;
    if (data.status !== "active") return null;
    if (data.owner_staff_id !== ownerStaffId) return null;
    if (data.token_hash !== hashToken(token)) return null;

    void this.client
      .from("lab_devices")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", deviceId)
      .then(({ error: touchErr }) => {
        if (touchErr) {
          this.logger.warn(`last_seen_at update failed: ${touchErr.message}`);
        }
      });

    const ownerFullName = await this.lookupFullName(data.owner_staff_id as string);
    return {
      deviceId: data.id as string,
      deviceName: data.name as string,
      ownerStaffId: data.owner_staff_id as string,
      ownerFullName,
    };
  }

  /** Explicit login checkpoint — called once by the web app right after sign-in. */
  async recordLoginAttempt(input: {
    device: DeviceSnapshot | null;
    userId: string;
    outcome: DeviceLoginOutcome;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    const { error } = await this.client.from("device_login_log").insert({
      device_id: input.device?.deviceId ?? null,
      user_id: input.userId,
      owner_staff_id: input.device?.ownerStaffId ?? null,
      outcome: input.outcome,
      ip: input.ip ?? null,
      user_agent: input.userAgent ?? null,
    });
    if (error) {
      this.logger.error(`device_login_log insert failed: ${error.message}`);
    }
    if (input.outcome === "success" && input.device) {
      await this.client
        .from("lab_devices")
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", input.device.deviceId);
    }
  }

  async listDevices(): Promise<LabDevice[]> {
    const { data, error } = await this.client
      .from("lab_devices")
      .select(
        "id, name, owner_staff_id, issued_by_staff_id, status, registered_at, last_login_at, last_seen_at, notes, profiles:owner_staff_id (full_name)",
      )
      .order("registered_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) =>
      this.toLabDevice(row as unknown as LabDeviceRow),
    );
  }

  async revokeDevice(id: string, revokedByStaffId: string): Promise<LabDevice> {
    const { data, error } = await this.client
      .from("lab_devices")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoked_by_staff_id: revokedByStaffId,
      })
      .eq("id", id)
      .select(
        "id, name, owner_staff_id, issued_by_staff_id, status, registered_at, last_login_at, last_seen_at, notes",
      )
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Device not found");
    return this.toLabDevice(data as unknown as LabDeviceRow);
  }

  private async lookupFullName(staffId: string): Promise<string | null> {
    const { data } = await this.client
      .from("profiles")
      .select("full_name")
      .eq("id", staffId)
      .maybeSingle();
    return (data?.full_name as string | null) ?? null;
  }

  private toLabDevice(
    row: LabDeviceRow & {
      profiles?:
        | { full_name?: string | null }
        | Array<{ full_name?: string | null }>
        | null;
    },
  ): LabDevice {
    const profileRow = Array.isArray(row.profiles)
      ? row.profiles[0]
      : row.profiles;
    return {
      id: row.id,
      name: row.name,
      ownerStaffId: row.owner_staff_id,
      ownerFullName: profileRow?.full_name ?? row.owner_full_name ?? null,
      issuedByStaffId: row.issued_by_staff_id,
      status: row.status,
      registeredAt: row.registered_at,
      lastLoginAt: row.last_login_at,
      lastSeenAt: row.last_seen_at,
    };
  }
}
