import { Module } from "@nestjs/common";
import { ResultsController } from "./results.controller";
import { ResultsService } from "./results.service";
import { SyncModule } from "../sync/sync.module";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [SyncModule, AuditModule, AuthModule],
  controllers: [ResultsController],
  providers: [ResultsService],
})
export class ResultsModule {}
