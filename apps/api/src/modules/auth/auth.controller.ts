import { Body, Controller, Inject, Post } from '@nestjs/common';
import { z } from 'zod';
import { zodBody } from '../../common/http/validation';
import { Public } from '../../common/auth/auth.guard';
import { RateLimit } from '../../common/rate-limit/rate-limit.guard';
import { AuthService } from './auth.service';

const signUpSchema = z.object({
  email: z.string().min(1).max(320),
  password: z.string().min(1).max(1024),
  handle: z.string().min(1).max(30),
  displayName: z.string().min(1).max(50),
});

const signInSchema = z.object({
  email: z.string().min(1).max(320),
  password: z.string().min(1).max(1024),
});

/**
 * 011/T014, T030. THE ONLY TWO ROUTES THIS FEATURE MAKES PUBLIC.
 *
 * No controller-level prefix: `app.setGlobalPrefix('v1')` supplies it, and a
 * `@Controller('v1')` here would produce `/v1/v1/...` — which 404s while every
 * route the smoke test checks keeps passing, because it checks other
 * controllers. 007 shipped that and it cost a whole feature's signals routes.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * `@Public()` IS ON EACH METHOD, AND THE ORDER OF METHODS IN THIS FILE MATTERS
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 004 recorded this twice: inserting a method ABOVE an existing decorated one
 * moves the `@Public()` onto the new method. A write becomes public, the read
 * starts 401ing, and typecheck and lint stay clean throughout.
 * `auth-surface.spec.ts` enumerates every route and compares against a snapshot
 * precisely because a hand-picked list only covers mistakes somebody has
 * already made.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE RATE LIMIT KEY IS THE CLIENT IP, AND THAT IS THE POINT
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `RateLimitGuard` keys on `req.viewer?.userId ?? req.ip`. There is no viewer on
 * a public route, so it falls back to the IP — which is the only key that can
 * satisfy FR-010, because a key derived from the address would have to know
 * whether the account exists to bucket it, and that is the fact the whole
 * feature is hiding.
 *
 * Checked rather than assumed (research R7): the guard was written for
 * authenticated routes, and a viewer-only key would have bucketed every failed
 * sign-in in the world together under `'anonymous'`.
 */
@Controller()
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  /**
   * FR-001. Creates an account and returns a credential.
   *
   * The capacity is low and the refill is slow: creating accounts is not
   * something a person does repeatedly, and this is the route that writes.
   */
  @Post('auth/sign-up')
  @Public()
  @RateLimit({ capacity: 5, refillPerSecond: 0.05 })
  async signUp(@Body() body: unknown) {
    return this.auth.signUp(zodBody(signUpSchema, body));
  }

  /**
   * FR-008. Exchanges an address and a password for a credential.
   *
   * More generous than sign-up — mistyping a password is ordinary — and still
   * bounded, because this is the route an enumeration attempt would use. The
   * limit cannot depend on whether the account exists (FR-010) and does not,
   * because the guard never learns which it was.
   */
  @Post('auth/sign-in')
  @Public()
  @RateLimit({ capacity: 10, refillPerSecond: 0.1 })
  async signIn(@Body() body: unknown) {
    return this.auth.signIn(zodBody(signInSchema, body));
  }
}
