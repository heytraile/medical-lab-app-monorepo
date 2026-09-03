import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import {
  RecallAccessionRequestSchema,
  ReleaseAccessionRequestSchema,
  SubmitResultsRequestSchema,
} from "@drax-lis/contracts";
import { ResultsService } from "./results.service";
import {
  CurrentUser,
  Roles,
  SupabaseAuthGuard,
  toActorSnapshot,
  type AuthUser,
} from "../auth/auth.guard";

@Controller("results")
export class ResultsController {
  constructor(private readonly results: ResultsService) {}

  @Get()
  list() {
    return this.results.list();
  }

  @Post("submit")
  @UseGuards(SupabaseAuthGuard)
  submit(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const parsed = SubmitResultsRequestSchema.parse(body);
    return this.results.submitForRelease(parsed, toActorSnapshot(user));
  }

  @Post("recall")
  @UseGuards(SupabaseAuthGuard)
  @Roles("tech", "authorizer", "admin")
  recall(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const parsed = RecallAccessionRequestSchema.parse(body);
    return this.results.recallFromRelease(parsed, toActorSnapshot(user));
  }

  @Post("mark-released")
  @UseGuards(SupabaseAuthGuard)
  @Roles("authorizer", "admin")
  markReleased(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const parsed = ReleaseAccessionRequestSchema.parse(body);
    return this.results.markAccessionReleased(parsed, toActorSnapshot(user));
  }
}
