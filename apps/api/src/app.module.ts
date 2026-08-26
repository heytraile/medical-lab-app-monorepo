import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { SyncModule } from "./sync/sync.module";
import { SupabaseModule } from "./supabase/supabase.module";
import { ResultsModule } from "./results/results.module";
import { AuthModule } from "./auth/auth.module";

@Module({
  imports: [
    HealthModule,
    SupabaseModule,
    AuthModule,
    SyncModule,
    ResultsModule,
  ],
})
export class AppModule {}
