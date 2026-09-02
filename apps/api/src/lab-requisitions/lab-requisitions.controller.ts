import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { LabRequisitionsService } from "./lab-requisitions.service";
import {
  RequisitionCreateSchema,
  RequisitionLinkSchema,
} from "@drax-lis/contracts";
import {
  CurrentUser,
  SupabaseAuthGuard,
  type AuthUser,
} from "../auth/auth.guard";

@Controller("requisitions")
@UseGuards(SupabaseAuthGuard)
export class LabRequisitionsController {
  constructor(private readonly service: LabRequisitionsService) {}

  @Post()
  create(@Body() body: unknown, @CurrentUser() user: AuthUser) {
    const parsed = RequisitionCreateSchema.parse(body);
    return this.service.create(parsed, user);
  }

  @Get()
  list(@Query("accession") accession?: string) {
    if (accession) {
      return this.service.getByAccession(accession);
    }
    return { message: "Provide ?accession= query parameter" };
  }

  @Get(":id")
  getById(@Param("id") id: string) {
    return this.service.getById(id);
  }

  @Patch(":id/link")
  link(@Param("id") id: string, @Body() body: unknown) {
    const parsed = RequisitionLinkSchema.parse(body);
    return this.service.link(id, parsed);
  }
}
