import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  EdgeStaffUser,
  StaffMemberCreate,
  StaffMemberUpdate,
  StaffRole,
} from "@drax-lis/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { SyncService } from "../sync/sync.service";
import { hashPassword } from "../auth/password.util";

type StaffRow = {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: string;
  jobTitle: string | null;
  isActive: boolean;
  cloudLoginAllowed: boolean;
  syncStatus: string;
};

/** Admin + authorizer can sign into the cloud app; tech cannot (edge-only). */
export function cloudLoginAllowedFor(role: StaffRole): boolean {
  return role === "admin" || role === "authorizer";
}

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: SyncService,
  ) {}

  async count(): Promise<number> {
    return this.prisma.staff.count();
  }

  async list(): Promise<EdgeStaffUser[]> {
    const rows = await this.prisma.staff.findMany({
      orderBy: { fullName: "asc" },
    });
    return rows.map((r) => this.toPublic(r));
  }

  async create(input: StaffMemberCreate): Promise<EdgeStaffUser> {
    const email = input.email.toLowerCase();
    const existing = await this.prisma.staff.findUnique({ where: { email } });
    if (existing) throw new ConflictException("Email already registered");

    const id = randomUUID();
    const cloudLoginAllowed = cloudLoginAllowedFor(input.role);
    const passwordHash = hashPassword(input.password);

    const row = await this.prisma.staff.create({
      data: {
        id,
        email,
        passwordHash,
        fullName: input.fullName,
        role: input.role,
        jobTitle: input.jobTitle,
        isActive: true,
        cloudLoginAllowed,
        syncStatus: "pending",
        passwordChangedAt: new Date(),
      },
    });

    await this.enqueueUpsert(row, input.password);
    return this.toPublic(row);
  }

  async update(
    id: string,
    patch: StaffMemberUpdate & { password?: string },
  ): Promise<EdgeStaffUser> {
    const existing = await this.prisma.staff.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Staff not found");

    const data: Record<string, unknown> = { syncStatus: "pending" };
    if (patch.fullName !== undefined) data.fullName = patch.fullName;
    if (patch.jobTitle !== undefined) data.jobTitle = patch.jobTitle;
    if (patch.isActive !== undefined) data.isActive = patch.isActive;
    if (patch.role !== undefined) {
      data.role = patch.role;
      data.cloudLoginAllowed = cloudLoginAllowedFor(patch.role);
    }

    let plaintextPassword: string | undefined;
    if (patch.password) {
      data.passwordHash = hashPassword(patch.password);
      data.passwordChangedAt = new Date();
      plaintextPassword = patch.password;
    }

    const row = await this.prisma.staff.update({ where: { id }, data });
    await this.enqueueUpsert(row, plaintextPassword);
    return this.toPublic(row);
  }

  /** Used by login — includes the password hash, never returned to callers. */
  async findActiveByEmail(email: string): Promise<StaffRow | null> {
    return this.prisma.staff.findFirst({
      where: { email: email.toLowerCase(), isActive: true },
    });
  }

  async findById(id: string): Promise<StaffRow | null> {
    return this.prisma.staff.findUnique({ where: { id } });
  }

  private async enqueueUpsert(row: StaffRow, password?: string) {
    await this.sync.enqueue({
      type: "staff.upsert",
      payload: {
        staffId: row.id,
        email: row.email,
        fullName: row.fullName,
        role: row.role,
        jobTitle: row.jobTitle,
        isActive: row.isActive,
        cloudLoginAllowed: row.cloudLoginAllowed,
        ...(password ? { password } : {}),
      },
    });
  }

  private toPublic(row: StaffRow): EdgeStaffUser {
    return {
      id: row.id,
      email: row.email,
      fullName: row.fullName,
      role: row.role as StaffRow["role"] as EdgeStaffUser["role"],
      jobTitle: row.jobTitle as EdgeStaffUser["jobTitle"],
      isActive: row.isActive,
    };
  }
}
