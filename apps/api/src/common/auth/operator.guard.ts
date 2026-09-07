import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { AppRequest } from '../http/request';

/**
 * FR-021 and FR-045. Operator authority is required to curate the top-level
 * interest catalogue and to act on reports.
 *
 * Separate from the OperatorOnly metadata on AuthGuard so it can be applied to a
 * whole controller: every moderation route is operator-only by default, rather
 * than each one having to remember to say so.
 */
@Injectable()
export class OperatorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AppRequest>();
    if (req.viewer?.isOperator !== true) {
      throw new UnauthorizedException('Operator authority required');
    }
    return true;
  }
}
