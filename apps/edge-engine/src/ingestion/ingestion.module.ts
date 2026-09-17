import { Module, forwardRef } from "@nestjs/common";
import { IngestionService } from "./ingestion.service";
import { IngestionController } from "./ingestion.controller";
import { AnalyzersController } from "./analyzers.controller";
import { RawMessagesController } from "./raw-messages.controller";
import { TcpIngestionDriver } from "./tcp-ingestion.driver";
import { SerialIngestionDriver } from "./serial-ingestion.driver";
import { ProlyteNetworkIngestionDriver } from "./prolyte-network-ingestion.driver";
import { AnalyzerStatusService } from "./analyzer-status.service";
import { HostQueryService } from "./host-query.service";
import { SyncModule } from "../sync/sync.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AuditModule,
    forwardRef(() => SyncModule),
    forwardRef(() => RealtimeModule),
  ],
  controllers: [IngestionController, AnalyzersController, RawMessagesController],
  providers: [
    IngestionService,
    AnalyzerStatusService,
    HostQueryService,
    TcpIngestionDriver,
    SerialIngestionDriver,
    ProlyteNetworkIngestionDriver,
  ],
  exports: [IngestionService, AnalyzerStatusService, HostQueryService],
})
export class IngestionModule {}
