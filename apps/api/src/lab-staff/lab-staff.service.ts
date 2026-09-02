import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DRAX_HALL_LAB } from "@drax-lis/catalog";
import type {
  StaffCollector,
  StaffMember,
  StaffMemberCreate,
  StaffMemberUpdate,
} from "@drax-lis/contracts";
import type { AuthUser } from "../auth/auth.guard";
import { SupabaseService } from "../supabase/supabase.module";

const COLLECTOR_JOB_TITLES = ["phlebotomist", "lab_technologist"] as const;

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: "tech" | "authorizer" | "admin";
  job_title: string | null;
  is_active: boolean;
  lab_id: string | null;
};

const PLACEHOLDER_STAFF: StaffMember[] = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    email: "admin@draxhall.local",
    fullName: "Sam Admin",
    role: "admin",
    jobTitle: "admin_staff",
    isActive: true,
  },
  {
    id: "11111111-1111-4111-8111-111111111111",
    email: "authorizer@draxhall.local",
    fullName: "Dr. Alicia Bennett",
    role: "authorizer",
    jobTitle: "physician",
    isActive: true,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    email: "tech@draxhall.local",
    fullName: "Marlon Reid",
    role: "tech",
    jobTitle: "phlebotomist",
    isActive: true,
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    email: "phleb@draxhall.local",
    fullName: "Jordan Blake",
    role: "tech",
    jobTitle: "lab_technologist",
    isActive: true,
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    email: "karen@draxhall.local",
    fullName: "Karen Sinclair",
    role: "tech",
    jobTitle: "phlebotomist",
    isActive: true,
  },
  {
    id: "66666666-6666-4666-8666-666666666666",
    email: "reception@draxhall.local",
    fullName: "Tanya Clarke",
    role: "tech",
    jobTitle: "receptionist",
    isActive: true,
  },
  {
    id: "77777777-7777-4777-8777-777777777777",
    email: "labtech@draxhall.local",
    fullName: "Devon Matthews",
    role: "tech",
    jobTitle: "lab_technologist",
    isActive: true,
  },
];

const DEV_COLLECTORS: StaffCollector[] = PLACEHOLDER_STAFF.filter(
  (s): s is StaffMember & { jobTitle: StaffCollector["jobTitle"] } =>
    Boolean(
      s.jobTitle &&
        (COLLECTOR_JOB_TITLES as readonly string[]).includes(s.jobTitle),
    ),
).map((s) => ({
  id: s.id,
  fullName: s.fullName ?? "Staff",
  jobTitle: s.jobTitle as StaffCollector["jobTitle"],
}));

@Injectable()
export class LabStaffService {
  constructor(private readonly supabase: SupabaseService) {}

  async listCollectors(user: AuthUser): Promise<StaffCollector[]> {
    if (!this.supabase.enabled || !this.supabase.client) {
      return DEV_COLLECTORS;
    }

    const labId = await this.resolveLabId(user.id);
    const { data, error } = await this.supabase.client
      .from("profiles")
      .select("id, full_name, job_title")
      .eq("lab_id", labId)
      .eq("is_active", true)
      .in("job_title", [...COLLECTOR_JOB_TITLES])
      .order("full_name", { ascending: true });

    if (error) {
      throw new BadRequestException(error.message);
    }

    const mapped = (data ?? [])
      .filter(
        (row): row is { id: string; full_name: string; job_title: string } =>
          Boolean(row.full_name && row.job_title),
      )
      .map((row) => ({
        id: row.id,
        fullName: row.full_name,
        jobTitle: row.job_title as StaffCollector["jobTitle"],
      }));

    return mapped.length > 0 ? mapped : DEV_COLLECTORS;
  }

  async listAll(user: AuthUser): Promise<StaffMember[]> {
    this.requireAdmin(user);
    if (!this.supabase.enabled || !this.supabase.client) {
      return PLACEHOLDER_STAFF;
    }

    const labId = await this.resolveLabId(user.id);
    const { data, error } = await this.supabase.client
      .from("profiles")
      .select("id, email, full_name, role, job_title, is_active")
      .eq("lab_id", labId)
      .order("full_name", { ascending: true });

    if (error) {
      throw new BadRequestException(error.message);
    }

    const rows = (data ?? []).map((row) => this.toStaffMember(row as ProfileRow));
    return rows.length > 0 ? rows : PLACEHOLDER_STAFF;
  }

  async create(user: AuthUser, body: StaffMemberCreate): Promise<StaffMember> {
    this.requireAdmin(user);
    if (!this.supabase.enabled || !this.supabase.client) {
      throw new BadRequestException(
        "Staff creation requires Supabase (cloud API)",
      );
    }

    const labId = await this.resolveLabId(user.id);
    const { data: created, error: createError } =
      await this.supabase.client.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: {
          role: body.role,
          full_name: body.fullName,
          job_title: body.jobTitle,
        },
      });

    if (createError || !created.user) {
      throw new BadRequestException(
        createError?.message ?? "Could not create staff account",
      );
    }

    const { data: profile, error: profileError } = await this.supabase.client
      .from("profiles")
      .update({
        lab_id: labId,
        job_title: body.jobTitle,
        full_name: body.fullName,
        role: body.role,
        is_active: true,
        email: body.email,
        updated_at: new Date().toISOString(),
      })
      .eq("id", created.user.id)
      .select("id, email, full_name, role, job_title, is_active")
      .single();

    if (profileError || !profile) {
      throw new BadRequestException(
        profileError?.message ?? "Profile update failed after user creation",
      );
    }

    return this.toStaffMember(profile as ProfileRow);
  }

  async update(
    user: AuthUser,
    id: string,
    body: StaffMemberUpdate,
  ): Promise<StaffMember> {
    this.requireAdmin(user);
    if (!this.supabase.enabled || !this.supabase.client) {
      throw new BadRequestException(
        "Staff updates require Supabase (cloud API)",
      );
    }

    const labId = await this.resolveLabId(user.id);
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.fullName !== undefined) patch.full_name = body.fullName;
    if (body.role !== undefined) patch.role = body.role;
    if (body.jobTitle !== undefined) patch.job_title = body.jobTitle;
    if (body.isActive !== undefined) patch.is_active = body.isActive;

    const { data, error } = await this.supabase.client
      .from("profiles")
      .update(patch)
      .eq("id", id)
      .eq("lab_id", labId)
      .select("id, email, full_name, role, job_title, is_active")
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }
    if (!data) {
      throw new NotFoundException("Staff member not found");
    }

    return this.toStaffMember(data as ProfileRow);
  }

  private requireAdmin(user: AuthUser) {
    if (user.role !== "admin") {
      throw new ForbiddenException("Admin role required");
    }
  }

  private async resolveLabId(userId: string): Promise<string> {
    if (!this.supabase.client) return DRAX_HALL_LAB.id;

    if (userId.startsWith("dev-")) {
      return DRAX_HALL_LAB.id;
    }

    const { data, error } = await this.supabase.client
      .from("profiles")
      .select("lab_id")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return (data?.lab_id as string | null) ?? DRAX_HALL_LAB.id;
  }

  private toStaffMember(row: ProfileRow): StaffMember {
    return {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
      jobTitle: (row.job_title as StaffMember["jobTitle"]) ?? null,
      isActive: row.is_active,
    };
  }
}
