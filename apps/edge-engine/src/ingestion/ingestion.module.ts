import { Module, forwardRef } from "@nestjs/common";
import { IngestionService } from "./ingestion.service";
import { IngestionController } from "./ingestion.controller";
import { AnalyzersController } from "./analyzers.controller";
import { TcpIngestionDriver } from "./tcp-ingestion.driver";
import { SerialIngestionDriver } from "./serial-ingestion.driver";
import { AnalyzerStatusService } from "./analyzer-status.service";
import { HostQueryService } from "./host-query.service";
import { SyncModule } from "../sync/sync.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    forwardRef(() => SyncModule),
    forwardRef(() => RealtimeModule),
  ],
  controllers: [IngestionController, AnalyzersController],
  providers: [
    IngestionService,
    AnalyzerStatusService,
    HostQueryService,
    TcpIngestionDriver,
    SerialIngestionDriver,
  ],
  exports: [IngestionService, AnalyzerStatusService, HostQueryService],
})
export class IngestionModule {}
