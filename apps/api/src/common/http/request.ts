import type { Request } from 'express';
import type { VerifiedPrincipal } from '../../ports';

/**
 * Request fields the guards and middleware attach. Declared explicitly rather
 * than by global module augmentation: augmentation makes `viewer` look present
 * on every Express request in the codebase, including ones where nothing has
 * resolved it yet. An explicit type forces each handler to say it expects one.
 */
export interface AppRequest extends Request {
  viewer?: VerifiedPrincipal | null;
  requestId?: string;
}
