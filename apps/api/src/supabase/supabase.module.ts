import { Global, Injectable, Logger, Module } from "@nestjs/common";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  readonly client: SupabaseClient | null;
  readonly enabled: boolean;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      this.client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      this.enabled = true;
      this.logger.log("Supabase client configured");
    } else {
      this.client = null;
      this.enabled = false;
      this.logger.warn(
        "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset — using in-memory sync store",
      );
    }
  }
}

@Global()
@Module({
  providers: [SupabaseService],
  exports: [SupabaseService],
})
export class SupabaseModule {}
