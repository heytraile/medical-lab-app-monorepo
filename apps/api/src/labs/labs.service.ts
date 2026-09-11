import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DRAX_HALL_LAB,
  DRAX_HALL_ROUTING_POLICY,
  catalogPolicyFields,
  normalizeLabRoutingPolicy,
  type LabRoutingPolicy,
} from "@drax-lis/catalog";
import type { LabRoutingScopeConfig } from "@drax-lis/contracts";
import { SupabaseService } from "../supabase/supabase.module";
import type { AuthUser } from "../auth/auth.guard";

@Injectable()
export class LabsService {
  constructor(private readonly supabase: SupabaseService) {}

  async getSettings(user: AuthUser) {
    const labId = DRAX_HALL_LAB.id;
    const policy = await this.loadRoutingPolicy(labId);
    const lab = await this.loadLabRow(labId);
    return {
      labId,
      labName: lab.name,
      routingPolicy: policy,
    };
  }

  async patchRoutingPolicy(
    user: AuthUser,
    patch: {
      accession?: Partial<LabRoutingScopeConfig>;
      labels?: Partial<LabRoutingScopeConfig>;
    },
  ) {
    const labId = DRAX_HALL_LAB.id;
    const current = await this.loadRoutingPolicy(labId);
    const next: LabRoutingPolicy = {
      consolidated: current.consolidated,
      accession: {
        ...current.accession,
        ...patch.accession,
      },
      labels: {
        ...current.labels,
        ...patch.labels,
      },
    };
    if (
      patch.accession?.mode &&
      !["granular", "consolidated"].includes(patch.accession.mode)
    ) {
      throw new BadRequestException("Invalid accession routing mode");
    }
    if (
      patch.labels?.mode &&
      !["granular", "consolidated"].includes(patch.labels.mode)
    ) {
      throw new BadRequestException("Invalid label routing mode");
    }

    const client = this.supabase.client;
    if (!client) {
      throw new BadRequestException("Supabase not configured");
    }

    const lab = await this.loadLabRow(labId);
    const settings =
      (lab.settings as Record<string, unknown> | null | undefined) ?? {};
    const { error } = await client
      .from("labs")
      .update({
        settings: {
          ...settings,
          routing: next,
        },
      })
      .eq("id", labId);
    if (error) throw new BadRequestException(error.message);

    return {
      labId,
      labName: lab.name,
      ...catalogPolicyFields(next),
    };
  }

  private async loadLabRow(labId: string) {
    const client = this.supabase.client;
    if (!client) {
      return {
        id: labId,
        name: DRAX_HALL_LAB.name,
        settings: { routing: DRAX_HALL_ROUTING_POLICY },
      };
    }
    const { data, error } = await client
      .from("labs")
      .select("id, name, settings")
      .eq("id", labId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException(`Lab ${labId} not found`);
    return data as { id: string; name: string; settings: unknown };
  }

  private async loadRoutingPolicy(labId: string): Promise<LabRoutingPolicy> {
    const lab = await this.loadLabRow(labId);
    const settings = lab.settings;
    const rawRouting =
      settings &&
      typeof settings === "object" &&
      "routing" in (settings as object)
        ? (settings as { routing: unknown }).routing
        : undefined;
    return rawRouting
      ? normalizeLabRoutingPolicy(rawRouting)
      : DRAX_HALL_ROUTING_POLICY;
  }
}
