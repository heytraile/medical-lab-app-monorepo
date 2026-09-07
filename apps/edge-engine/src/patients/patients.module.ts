import { Module } from "@nestjs/common";
import { PatientsController } from "./patients.controller";
import { PatientsService } from "./patients.service";
import { PatientsImportService } from "./patients-import.service";
import { PatientsSeedService } from "./patients-seed.service";
import { SyncModule } from "../sync/sync.module";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [SyncModule, AuthModule, AuditModule],
  controllers: [PatientsController],
  providers: [PatientsService, PatientsImportService, PatientsSeedService],
  exports: [PatientsService, PatientsImportService, PatientsSeedService],
})
export class PatientsModule {}
