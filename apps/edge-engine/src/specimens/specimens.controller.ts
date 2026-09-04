import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import type {
  ActorSnapshot,
  RegisterSpecimensBatchRequest,
} from "@drax-lis/contracts";
import { SpecimensService } from "./specimens.service";
import {
  OptionalSupabaseAuthGuard,
  OptionalUser,
  toActorSnapshot,
  type AuthUser,
} from "../auth/auth.guard";

@Controller("specimens")
export class SpecimensController {
  constructor(private readonly specimens: SpecimensService) {}

  @Get()
  list(@Query("accession") accession?: string) {
    if (accession?.trim()) {
      return this.specimens.findByAccession(accession.trim());
    }
    return this.specimens.list();
  }

  @Post()
  @UseGuards(OptionalSupabaseAuthGuard)
  register(
    @Body()
    body: {
      accessionNumber?: string;
      barcode?: string;
      patientId: string;
      identityConfirmation?: {
        decision: "distinct_people" | "possible_duplicate_acknowledged";
        suspectGroupId: string;
        confirmedAt?: string;
        confirmedBy?: string;
      };
      orderedTests?: Array<{ code: string; name?: string }>;
      requisitionId?: string;
      printLabel?: boolean;
      copies?: number;
      specimenType?: string;
      collectedAt?: string;
    },
    @OptionalUser() user?: AuthUser,
  ) {
    const actor: ActorSnapshot | null = user ? toActorSnapshot(user) : null;
    return this.specimens.register(body, actor);
  }

  @Post("batch")
  @UseGuards(OptionalSupabaseAuthGuard)
  registerBatch(
    @Body() body: RegisterSpecimensBatchRequest,
    @OptionalUser() user?: AuthUser,
  ) {
    const actor: ActorSnapshot | null = user ? toActorSnapshot(user) : null;
    return this.specimens.registerBatch(body, actor);
  }
}
