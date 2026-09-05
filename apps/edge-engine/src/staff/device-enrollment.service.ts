import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { createHash, randomInt } from "node:crypto";
import type { DeviceEnrollmentCodeCreate } from "@drax-lis/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { StaffService } from "./staff.service";

const CODE_LENGTH = 8;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — easy to read aloud
const CODE_TTL_MINUTES = 10;

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * Issues one-time codes that let a specific admin/authorizer enroll their
 * browser as a "lab-issued device" for cloud login. The code is generated
 * here, then immediately pushed to the cloud API (same trusted channel as
 * outbox sync) so the cloud can validate it when the browser redeems it.
 */
@Injectable()
export class DeviceEnrollmentService {
  private readonly logger = new Logger(DeviceEnrollmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly staff: StaffService,
  ) {}

  async issueCode(
    input: DeviceEnrollmentCodeCreate,
    createdByStaffId: string,
  ): Promise<{ code: string; expiresAt: string; assignToStaffId: string }> {
    const assignee = await this.staff.findById(input.assignToStaffId);
    if (!assignee) {
      throw new NotFoundException("Assignee staff member not found");
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

    await this.prisma.deviceEnrollmentCode.create({
      data: {
        codeHash: hashCode(code),
        assignToStaffId: input.assignToStaffId,
        createdByStaffId,
        deviceLabel: input.deviceLabel,
        expiresAt,
      },
    });

    await this.pushToCloud({
      code,
      assignToStaffId: input.assignToStaffId,
      createdByStaffId,
      deviceLabel: input.deviceLabel,
      expiresAt: expiresAt.toISOString(),
    });

    return {
      code,
      expiresAt: expiresAt.toISOString(),
      assignToStaffId: input.assignToStaffId,
    };
  }

  /**
   * Enrollment must be validated on the cloud (that's where the browser
   * signs in), so the freshly generated code is pushed there immediately.
   * This requires internet at the moment of generating the code — that's
   * expected, since enrolling a cloud device is inherently an online step.
   */
  private async pushToCloud(input: {
    code: string;
    assignToStaffId: string;
    createdByStaffId: string;
    deviceLabel?: string;
    expiresAt: string;
  }): Promise<void> {
    const cloudUrl = process.env.CLOUD_API_URL ?? "http://localhost:3102";
    const res = await fetch(`${cloudUrl}/sync/device-enrollment-codes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.EDGE_SYNC_TOKEN
          ? { Authorization: `Bearer ${process.env.EDGE_SYNC_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      this.logger.error(
        `Cloud rejected device enrollment code (status ${res.status}): ${text}`,
      );
      throw new Error(
        "Could not reach the cloud to register this code — check internet and try again",
      );
    }
  }
}
