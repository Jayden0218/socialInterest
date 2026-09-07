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

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

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
