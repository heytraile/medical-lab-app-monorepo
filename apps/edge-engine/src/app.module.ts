import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./health/health.module";
import { IngestionModule } from "./ingestion/ingestion.module";
import { PrinterModule } from "./printer/printer.module";
import { SyncModule } from "./sync/sync.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { SpecimensModule } from "./specimens/specimens.module";
import { ResultsModule } from "./results/results.module";
import { PatientsModule } from "./patients/patients.module";
import { DemoModule } from "./demo/demo.module";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    HealthModule,
    IngestionModule,
    PrinterModule,
    SyncModule,
    RealtimeModule,
    SpecimensModule,
    ResultsModule,
    PatientsModule,
    DemoModule,
  ],
})
export class AppModule {}
