import { Controller, Get } from "@nestjs/common";
import { ResultsService } from "./results.service";

@Controller("results")
export class ResultsController {
  constructor(private readonly results: ResultsService) {}

  @Get()
  list() {
    return this.results.list();
  }
}
