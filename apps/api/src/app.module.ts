import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { SyncModule } from "./sync/sync.module";
import { SupabaseModule } from "./supabase/supabase.module";

@Module({
  imports: [HealthModule, SupabaseModule, SyncModule],
})
export class AppModule {}
