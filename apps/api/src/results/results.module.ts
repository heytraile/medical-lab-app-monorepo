import { Module } from "@nestjs/common";
import { ResultsController } from "./results.controller";
import { SyncModule } from "../sync/sync.module";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [SyncModule, AuthModule, AuditModule],
  controllers: [ResultsController],
})
export class ResultsModule {}
