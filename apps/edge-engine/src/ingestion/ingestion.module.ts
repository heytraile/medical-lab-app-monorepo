import { Module, forwardRef } from "@nestjs/common";
import { IngestionService } from "./ingestion.service";
import { IngestionController } from "./ingestion.controller";
import { TcpIngestionDriver } from "./tcp-ingestion.driver";
import { SyncModule } from "../sync/sync.module";
import { RealtimeModule } from "../realtime/realtime.module";

@Module({
  imports: [forwardRef(() => SyncModule), forwardRef(() => RealtimeModule)],
  controllers: [IngestionController],
  providers: [IngestionService, TcpIngestionDriver],
  exports: [IngestionService],
})
export class IngestionModule {}
