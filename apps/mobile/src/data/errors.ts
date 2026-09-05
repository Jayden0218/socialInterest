import { ApiError } from '@sih/shared';

/**
 * RFC 9457 problem+json, including extension members. Feature 001 shipped a
 * filter that dropped extensions, so a near-duplicate 409 arrived without its
 * `candidates` and the screen had nothing to offer. Keep the whole body.
 */
export interface Problem {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  [extension: string]: unknown;
}

export class DataError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Problem,
  ) {
    super(problem.detail ?? problem.title ?? `Request failed (${status})`);
    this.name = 'DataError';
  }

  /** Extension member, e.g. `candidates` on a near-duplicate interest refusal. */
  extension<T>(name: string): T | undefined {
    return this.problem[name] as T | undefined;
  }

  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
  /** Exists but not for you. Distinct from 404 - see FR-042. */
  get isForbidden(): boolean {
    return this.status === 403;
  }
  /** Gone, or blocked, or never existed. Deliberately indistinguishable. */
  get isNotFound(): boolean {
    return this.status === 404;
  }
  get isConflict(): boolean {
    return this.status === 409;
  }
  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

export function toDataError(err: unknown): DataError {
  if (err instanceof DataError) return err;
  if (err instanceof ApiError) {
    const problem = (typeof err.problem === 'object' && err.problem !== null ? err.problem : {}) as Problem;
    return new DataError(err.status, problem);
  }
  const message = err instanceof Error ? err.message : String(err);
  // Offline, DNS failure, TLS - no HTTP status exists, and pretending one does
  // would let a screen render "not found" for a dropped connection.
  return new DataError(0, { title: 'Network unavailable', detail: message });
}
