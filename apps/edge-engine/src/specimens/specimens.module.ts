import { Module } from "@nestjs/common";
import { SpecimensController } from "./specimens.controller";
import { SpecimensService } from "./specimens.service";
import { PrinterModule } from "../printer/printer.module";
import { SyncModule } from "../sync/sync.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { AuthModule } from "../auth/auth.module";
import { PatientsModule } from "../patients/patients.module";

@Module({
  imports: [
    PrinterModule,
    SyncModule,
    RealtimeModule,
    AuthModule,
    PatientsModule,
  ],
  controllers: [SpecimensController],
  providers: [SpecimensService],
})
export class SpecimensModule {}
