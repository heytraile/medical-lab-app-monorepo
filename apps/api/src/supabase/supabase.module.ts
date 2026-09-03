import { Global, Injectable, Logger, Module } from "@nestjs/common";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  /** Service-role client — DB writes, catalog sync, profile lookups. */
  readonly client: SupabaseClient | null;
  /** Anon client — validates end-user JWTs via auth.getUser(token). */
  readonly authClient: SupabaseClient | null;
  readonly enabled: boolean;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey =
      process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

    if (url && serviceKey) {
      this.client = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      this.authClient = anonKey
        ? createClient(url, anonKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
        : this.client;
      this.enabled = true;
      this.logger.log("Supabase client configured");
      if (!anonKey) {
        this.logger.warn(
          "SUPABASE_ANON_KEY unset — user JWT validation may fail; set it in local.env",
        );
      }
    } else {
      this.client = null;
      this.authClient = null;
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
