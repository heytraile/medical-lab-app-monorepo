import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PatientsService } from "./patients.service";
import { PatientsSeedService } from "./patients-seed.service";
import { DevOnlyGuard } from "../auth/dev-only.guard";
import { HardenedAuthGuard } from "../auth/hardened-auth.guard";
import {
  CurrentUser,
  EdgeAuthGuard,
  Roles,
  toActorSnapshot,
  type AuthUser,
} from "../auth/auth.guard";

@Controller("patients")
@UseGuards(HardenedAuthGuard)
export class PatientsController {
  constructor(
    private readonly patients: PatientsService,
    private readonly seed: PatientsSeedService,
  ) {}

  @Get()
  list(
    @Query("q") q?: string,
    @Query("includeQuarantined") includeQuarantined?: string,
  ) {
    return this.patients.list({
      q,
      includeQuarantined:
        includeQuarantined === "1" || includeQuarantined === "true",
    });
  }

  @Post()
  create(
    @Body()
    body: {
      firstName: string;
      lastName: string;
      middleName?: string;
      dateOfBirth?: string;
      sex?: string;
    },
  ) {
    return this.patients.createProvisional(body);
  }

  /** Must be declared before `:id` so it is not captured as an id. */
  @Post("seed")
  @UseGuards(DevOnlyGuard)
  async reseed() {
    return this.seed.seed();
  }

  @Get("identity-reviews")
  listIdentityReviews(@Query("status") status?: string) {
    const allowed = ["pending", "resolved_distinct", "merged", "all"] as const;
    const parsed = allowed.includes(status as (typeof allowed)[number])
      ? (status as (typeof allowed)[number])
      : "pending";
    return this.patients.listIdentityReviews({ status: parsed });
  }

  @Post("identity-reviews/:id/resolve-distinct")
  @UseGuards(EdgeAuthGuard)
  @Roles("admin")
  resolveDistinct(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
    @Body() body?: { note?: string },
  ) {
    return this.patients.resolveIdentityReviewDistinct(
      id,
      toActorSnapshot(user),
      body?.note,
    );
  }

  @Post("merge")
  @UseGuards(EdgeAuthGuard)
  @Roles("admin")
  merge(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      survivorPatientId: string;
      loserPatientId: string;
      reviewItemId?: string;
      reason?: string;
    },
  ) {
    return this.patients.mergePatients(body, toActorSnapshot(user));
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.patients.get(id);
  }
}
