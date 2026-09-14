import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import type { AppRequest } from '../http/request';

export interface RateLimitSpec {
  /** Bucket capacity - the most a person may do in a burst. */
  capacity: number;
  /** Tokens refilled per second. */
  refillPerSecond: number;
}

export const RATE_LIMIT = 'rate-limit:spec';
/** FR-046: publishing, commenting, and sub-interest creation are rate limited. */
export const RateLimit = (spec: RateLimitSpec) => SetMetadata(RATE_LIMIT, spec);

interface Bucket {
  tokens: number;
  lastRefill: number;
}

/**
 * 011. THE BUCKETS, AT MODULE SCOPE RATHER THAN ON THE INSTANCE.
 *
 * One guard instance exists per application, so in production this is the same
 * state it was before. What it buys is a way for a test to clear it — see
 * `resetRateLimitsForTests` below — which Nest otherwise makes unreachable:
 * `{ provide: APP_GUARD, useClass: RateLimitGuard }` registers the instance
 * under neither the class nor `APP_GUARD` in a way `module.get` can resolve.
 *
 * Jest gives each test FILE its own module registry, so this does not leak
 * between suites.
 */
const BUCKETS = new Map<string, Bucket>();

/**
 * TEST-ONLY, and named so that nobody has to guess.
 *
 * `auth-signup-concurrency.spec.ts` measures how many of N simultaneous
 * sign-ups the UNIQUENESS CONSTRAINT admits. Its first version fired six
 * against a route with a capacity of five: one came back 201, the assertion
 * passed, and the other five had been refused 429 without ever reaching the
 * constraint. Delete the conditional write and that test still passed.
 *
 * The alternative was raising a real rate limit to suit a test — changing the
 * product to make a measurement convenient, which is how a limit ends up
 * chosen by a test rather than by what it is defending.
 */
export function resetRateLimitsForTests(): void {
  BUCKETS.clear();
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = BUCKETS;

  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const spec = this.reflector.getAllAndOverride<RateLimitSpec | undefined>(RATE_LIMIT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!spec) return true;

    const req = context.switchToHttp().getRequest<AppRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const who = req.viewer?.userId ?? req.ip ?? 'anonymous';
    const key = `${who}:${context.getClass().name}.${context.getHandler().name}`;

    const now = Date.now();
    const bucket = this.buckets.get(key) ?? { tokens: spec.capacity, lastRefill: now };
    const elapsedSeconds = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(spec.capacity, bucket.tokens + elapsedSeconds * spec.refillPerSecond);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      this.buckets.set(key, bucket);
      const retryAfter = Math.ceil((1 - bucket.tokens) / spec.refillPerSecond);
      res.setHeader('Retry-After', String(retryAfter));
      throw new HttpException(
        { title: 'Rate limit exceeded', detail: `Retry in ${retryAfter}s` },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return true;
  }
}
