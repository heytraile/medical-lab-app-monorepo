import {
  Controller,
  Get,
  Query,
  UseGuards,
} from "@nestjs/common";
import { SyncService } from "./sync.service";
import { SupabaseAuthGuard } from "../auth/auth.guard";

@Controller("cloud")
@UseGuards(SupabaseAuthGuard)
export class CloudReadController {
  constructor(private readonly sync: SyncService) {}

  @Get("results")
  results(@Query("status") status?: string) {
    return this.sync.listResults({ status });
  }

  @Get("specimens")
  specimens() {
    return this.sync.listSpecimens();
  }
}
