import { Injectable, Logger } from "@nestjs/common";
import { DRAX_HALL_LAB } from "@drax-lis/catalog";
import type { StaffUpsertEventPayload } from "@drax-lis/contracts";
import { SupabaseService } from "../supabase/supabase.module";

/**
 * Projects the edge's `staff.upsert` outbox event into Supabase Auth +
 * `profiles`. Staff signup only ever happens on the edge — this is the one
 * place that turns an edge Staff row into a cloud identity.
 *
 * Same UUID on both sides (`auth.users.id` === edge `Staff.id`), so this is
 * idempotent: retry-safe if the edge resends the same event.
 */
@Injectable()
export class StaffProvisioningService {
  private readonly logger = new Logger(StaffProvisioningService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async upsertFromEdge(payload: StaffUpsertEventPayload): Promise<void> {
    if (!this.supabase.enabled || !this.supabase.client) {
      this.logger.debug(
        `staff.upsert (memory skip): ${payload.email} role=${payload.role}`,
      );
      return;
    }

    const client = this.supabase.client;
    const { data: existing } = await client.auth.admin.getUserById(
      payload.staffId,
    );

    if (!existing?.user) {
      const { error } = await client.auth.admin.createUser({
        id: payload.staffId,
        email: payload.email,
        password: payload.password,
        email_confirm: true,
        user_metadata: {
          role: payload.role,
          full_name: payload.fullName,
          job_title: payload.jobTitle,
        },
      });
      if (error) {
        // Race with a previous attempt / manually created account — fall
        // through to updateUserById so the row still ends up correct.
        this.logger.warn(
          `auth.admin.createUser failed for ${payload.email}: ${error.message} — retrying as update`,
        );
        await this.updateAuthUser(payload);
      }
    } else if (payload.password) {
      await this.updateAuthUser(payload);
    }

    const { error: profileError } = await client
      .from("profiles")
      .update({
        email: payload.email,
        full_name: payload.fullName,
        role: payload.role,
        job_title: payload.jobTitle,
        is_active: payload.isActive,
        cloud_login_allowed: payload.cloudLoginAllowed,
        lab_id: DRAX_HALL_LAB.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payload.staffId);

    if (profileError) {
      this.logger.error(
        `profiles update failed for ${payload.staffId}: ${profileError.message}`,
      );
      throw profileError;
    }
  }

  private async updateAuthUser(payload: StaffUpsertEventPayload) {
    if (!this.supabase.client) return;
    const { error } = await this.supabase.client.auth.admin.updateUserById(
      payload.staffId,
      {
        email: payload.email,
        ...(payload.password ? { password: payload.password } : {}),
        user_metadata: {
          role: payload.role,
          full_name: payload.fullName,
          job_title: payload.jobTitle,
        },
      },
    );
    if (error) {
      this.logger.error(
        `auth.admin.updateUserById failed for ${payload.email}: ${error.message}`,
      );
      throw error;
    }
  }
}
