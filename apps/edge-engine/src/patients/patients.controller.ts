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

  @Get(":id")
  get(@Param("id") id: string) {
    return this.patients.get(id);
  }
}
