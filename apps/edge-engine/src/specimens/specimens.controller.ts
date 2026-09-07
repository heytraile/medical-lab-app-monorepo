import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import type {
  ActorSnapshot,
  RegisterSpecimensBatchRequest,
} from "@drax-lis/contracts";
import { SpecimensService } from "./specimens.service";
import {
  OptionalUser,
  toActorSnapshot,
  type AuthUser,
} from "../auth/auth.guard";
import { HardenedAuthGuard, HardenedRequiredAuthGuard } from "../auth/hardened-auth.guard";

@Controller("specimens")
@UseGuards(HardenedAuthGuard)
export class SpecimensController {
  /** List/register specimens; list includes orderedSelections for History panels. */
  constructor(private readonly specimens: SpecimensService) {}

  @Get()
  list(@Query("accession") accession?: string, @Query("q") q?: string) {
    if (accession?.trim()) {
      return this.specimens.findByAccession(accession.trim());
    }
    return this.specimens.list({ q: q?.trim() || undefined });
  }

  @Post()
  @UseGuards(HardenedRequiredAuthGuard)
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
      collectedByStaffId?: string;
      collectedBy?: string;
    },
    @OptionalUser() user?: AuthUser,
  ) {
    const actor: ActorSnapshot | null = user ? toActorSnapshot(user) : null;
    return this.specimens.register(body, actor);
  }

  @Post("batch")
  @UseGuards(HardenedRequiredAuthGuard)
  registerBatch(
    @Body() body: RegisterSpecimensBatchRequest,
    @OptionalUser() user?: AuthUser,
  ) {
    const actor: ActorSnapshot | null = user ? toActorSnapshot(user) : null;
    return this.specimens.registerBatch(body, actor);
  }
}
