import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { hashPassword } from "../auth/password.util";
import { SyncService } from "../sync/sync.service";
import { cloudLoginAllowedFor } from "./staff.service";

/**
 * Same fixed accounts/UUIDs as `supabase/seed.sql` — kept in sync so
 * `pnpm dev:local` still logs in with the same emails/password, but the
 * source of truth is now the edge SQLite `Staff` table, pushed to the local
 * Supabase via the normal outbox sync loop (not the seed.sql inserts).
 */
const DEV_FIXTURE_PASSWORD = "password123";

const DEV_STAFF_FIXTURES: Array<{
  id: string;
  email: string;
  fullName: string;
  role: "tech" | "authorizer" | "admin";
  jobTitle: string;
}> = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    email: "admin@draxhall.local",
    fullName: "Sam Admin",
    role: "admin",
    jobTitle: "admin_staff",
  },
  {
    id: "11111111-1111-4111-8111-111111111111",
    email: "authorizer@draxhall.local",
    fullName: "Dr. Alicia Bennett",
    role: "authorizer",
    jobTitle: "physician",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    email: "tech@draxhall.local",
    fullName: "Marlon Reid",
    role: "tech",
    jobTitle: "phlebotomist",
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    email: "phleb@draxhall.local",
    fullName: "Jordan Blake",
    role: "tech",
    jobTitle: "lab_technologist",
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    email: "karen@draxhall.local",
    fullName: "Karen Sinclair",
    role: "tech",
    jobTitle: "phlebotomist",
  },
  {
    id: "66666666-6666-4666-8666-666666666666",
    email: "reception@draxhall.local",
    fullName: "Tanya Clarke",
    role: "tech",
    jobTitle: "receptionist",
  },
  {
    id: "77777777-7777-4777-8777-777777777777",
    email: "labtech@draxhall.local",
    fullName: "Devon Matthews",
    role: "tech",
    jobTitle: "lab_technologist",
  },
];

@Injectable()
export class StaffSeedService implements OnModuleInit {
  private readonly logger = new Logger(StaffSeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: SyncService,
  ) {}

  async onModuleInit() {
    // Never auto-create accounts on a hardened lab deployment — the first
    // admin there comes from POST /staff/bootstrap-admin instead.
    if (process.env.EDGE_STAFF_SEED === "false") return;

    try {
      const count = await this.prisma.staff.count();
      if (count > 0) return;

      for (const fixture of DEV_STAFF_FIXTURES) {
        const row = await this.prisma.staff.create({
          data: {
            id: fixture.id,
            email: fixture.email,
            passwordHash: hashPassword(DEV_FIXTURE_PASSWORD),
            fullName: fixture.fullName,
            role: fixture.role,
            jobTitle: fixture.jobTitle,
            isActive: true,
            cloudLoginAllowed: cloudLoginAllowedFor(fixture.role),
            syncStatus: "pending",
            passwordChangedAt: new Date(),
          },
        });
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
            password: DEV_FIXTURE_PASSWORD,
          },
        });
      }
      this.logger.log(
        `Seeded ${DEV_STAFF_FIXTURES.length} dev staff account(s) — password: ${DEV_FIXTURE_PASSWORD}`,
      );
    } catch (err) {
      this.logger.warn(
        `Staff seed skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
