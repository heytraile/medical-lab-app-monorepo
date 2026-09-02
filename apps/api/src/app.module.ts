import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { SyncModule } from "./sync/sync.module";
import { SupabaseModule } from "./supabase/supabase.module";
import { ResultsModule } from "./results/results.module";
import { ReviewRequestsModule } from "./review-requests/review-requests.module";
import { CatalogModule } from "./catalog/catalog.module";
import { LabRequisitionsModule } from "./lab-requisitions/lab-requisitions.module";
import { LabStaffModule } from "./lab-staff/lab-staff.module";
import { AuthModule } from "./auth/auth.module";

@Module({
  imports: [
    HealthModule,
    SupabaseModule,
    AuthModule,
    SyncModule,
    ResultsModule,
    ReviewRequestsModule,
    CatalogModule,
    LabRequisitionsModule,
    LabStaffModule,
  ],
})
export class AppModule {}
