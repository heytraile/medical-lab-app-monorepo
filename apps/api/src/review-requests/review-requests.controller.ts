import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ReviewRequestsService } from "./review-requests.service";
import { ReviewRequestCreateSchema } from "@drax-lis/contracts";
import {
  CurrentUser,
  Roles,
  SupabaseAuthGuard,
  type AuthUser,
} from "../auth/auth.guard";

@Controller("review-requests")
@UseGuards(SupabaseAuthGuard)
export class ReviewRequestsController {
  constructor(private readonly service: ReviewRequestsService) {}

  /** Any role: raising the alert is the bench tech's job. */
  @Post()
  create(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const parsed = ReviewRequestCreateSchema.parse(body);
    return this.service.create(parsed, user);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("open") open?: string) {
    return this.service.list({ open: open === "true", user });
  }

  /** Acknowledging is the sign-off, so it carries the release role gate. */
  @Post(":id/ack")
  @Roles("authorizer", "admin")
  acknowledge(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.acknowledge(id, user);
  }
}
