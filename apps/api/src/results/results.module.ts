import { Module } from "@nestjs/common";
import { ResultsController } from "./results.controller";
import { SyncModule } from "../sync/sync.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [SyncModule, AuthModule],
  controllers: [ResultsController],
})
export class ResultsModule {}
