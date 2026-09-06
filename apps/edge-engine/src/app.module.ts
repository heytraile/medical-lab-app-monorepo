import { Module, DynamicModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
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
import { AuditModule } from "./audit/audit.module";
import { BackupModule } from "./backup/backup.module";
import { AuthModule } from "./auth/auth.module";
import { StaffModule } from "./staff/staff.module";
import { MessagingModule } from "./messaging/messaging.module";
import { isProductionHardened } from "./config/production-hardening";

const hardened = isProductionHardened();

const hardenedImports: DynamicModule[] = hardened
  ? [
      ThrottlerModule.forRoot([
        {
          name: "default",
          ttl: 60_000,
          limit: 100,
        },
      ]),
    ]
  : [];

const hardenedProviders = hardened
  ? [{ provide: APP_GUARD, useClass: ThrottlerGuard }]
  : [];

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ...hardenedImports,
    PrismaModule,
    AuthModule,
    StaffModule,
    AuditModule,
    HealthModule,
    IngestionModule,
    PrinterModule,
    SyncModule,
    RealtimeModule,
    SpecimensModule,
    ResultsModule,
    PatientsModule,
    BackupModule,
    MessagingModule,
    ...(hardened ? [] : [DemoModule]),
  ],
  providers: [...hardenedProviders],
})
export class AppModule {}
