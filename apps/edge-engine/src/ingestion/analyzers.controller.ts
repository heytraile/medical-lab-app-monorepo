import { Controller, Get, UseGuards } from "@nestjs/common";
import { AnalyzerStatusService } from "./analyzer-status.service";
import { HardenedAuthGuard } from "../auth/hardened-auth.guard";

@Controller("analyzers")
export class AnalyzersController {
  constructor(private readonly status: AnalyzerStatusService) {}

  @Get("status")
  @UseGuards(HardenedAuthGuard)
  listStatus() {
    return this.status.list();
  }
}
