import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { isProductionHardened } from "../config/production-hardening";
import { EdgeAuthGuard, OptionalEdgeAuthGuard } from "./auth.guard";

/** Requires edge login (or dev: token) only when edge hardening is enabled. */
@Injectable()
export class HardenedAuthGuard implements CanActivate {
  constructor(private readonly auth: EdgeAuthGuard) {}

  canActivate(context: ExecutionContext) {
    if (!isProductionHardened()) return true;
    return this.auth.canActivate(context);
  }
}

/** Optional auth in dev; required auth when hardened (specimen registration). */
@Injectable()
export class HardenedRequiredAuthGuard implements CanActivate {
  constructor(
    private readonly optional: OptionalEdgeAuthGuard,
    private readonly required: EdgeAuthGuard,
  ) {}

  canActivate(context: ExecutionContext) {
    if (!isProductionHardened()) {
      return this.optional.canActivate(context);
    }
    return this.required.canActivate(context);
  }
}

const devTokenLogger = new Logger("AuthGuard");

export function rejectDevTokenInHardenedMode(token: string): void {
  if (token.startsWith("dev:") && isProductionHardened()) {
    devTokenLogger.warn("Rejected dev:* bearer token in hardened mode");
    throw new UnauthorizedException("Dev tokens are disabled in production");
  }
}
