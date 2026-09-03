import { Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SupabaseAuthGuard, OptionalSupabaseAuthGuard } from "./auth.guard";
import { SupabaseModule } from "../supabase/supabase.module";

@Module({
  imports: [SupabaseModule],
  providers: [SupabaseAuthGuard, OptionalSupabaseAuthGuard, Reflector],
  exports: [SupabaseAuthGuard, OptionalSupabaseAuthGuard, SupabaseModule],
})
export class AuthModule {}
