import { Controller, Get } from "@nestjs/common";
import { AnalyzerStatusService } from "./analyzer-status.service";

@Controller("analyzers")
export class AnalyzersController {
  constructor(private readonly status: AnalyzerStatusService) {}

  @Get("status")
  listStatus() {
    return this.status.list();
  }
}
