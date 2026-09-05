import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { isProductionHardened } from "../config/production-hardening";

/** Hides dev/test HTTP routes on hardened lab deployments (404, not 403). */
@Injectable()
export class DevOnlyGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    if (isProductionHardened()) {
      throw new NotFoundException();
    }
    return true;
  }
}
