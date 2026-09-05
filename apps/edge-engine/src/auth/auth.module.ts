import { Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { EdgeAuthGuard, OptionalEdgeAuthGuard } from "./auth.guard";
import { DevOnlyGuard } from "./dev-only.guard";
import { EdgeJwtService } from "./edge-jwt.service";
import {
  HardenedAuthGuard,
  HardenedRequiredAuthGuard,
} from "./hardened-auth.guard";

@Module({
  providers: [
    EdgeJwtService,
    EdgeAuthGuard,
    OptionalEdgeAuthGuard,
    DevOnlyGuard,
    HardenedAuthGuard,
    HardenedRequiredAuthGuard,
    Reflector,
  ],
  exports: [
    EdgeJwtService,
    EdgeAuthGuard,
    OptionalEdgeAuthGuard,
    DevOnlyGuard,
    HardenedAuthGuard,
    HardenedRequiredAuthGuard,
  ],
})
export class AuthModule {}
