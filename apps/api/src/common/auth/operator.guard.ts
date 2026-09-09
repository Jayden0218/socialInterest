import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
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
      /**
       * 403, and it used to be 401 — THE CONTRACT SAID 403 THE WHOLE TIME.
       *
       * `openapi.yaml` documents `403: Not an operator` on every moderation
       * route; the code threw `UnauthorizedException`. That is 002's first
       * defect in a smaller place: the contract and the API disagreed, and both
       * sides looked right on their own. Found by 008/T199's route snapshot,
       * which asserted the documented status rather than the implemented one.
       *
       * The caller here is authenticated and simply is not staff. 401 tells a
       * client its credentials are the problem, so the correct client reaction
       * is to sign in again — which cannot help, and on a mobile client means
       * throwing away a working session over a permission it was never going to
       * have. Nothing asserted the old code, which is why it survived.
       *
       * There is no disclosure argument for hiding these behind a 404 the way
       * the visibility boundary hides a block: `/moderation/*` is a documented
       * surface and its existence is not a secret. What must not leak is what is
       * IN the queue, and that is why the guard refuses before the handler runs.
       */
      throw new ForbiddenException('Operator authority required');
    }
    return true;
  }
}
