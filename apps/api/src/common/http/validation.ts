import { HttpStatus } from '@nestjs/common';
import type { ZodType } from 'zod';
import { DomainError } from '../errors/problem.filter';

/**
 * Validates a request body against a shared zod schema, reporting failures as
 * RFC 9457 problem details with per-field errors.
 */
export function zodBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;

  const error = new DomainError(HttpStatus.UNPROCESSABLE_ENTITY, 'Validation failed');
  (error.getResponse() as Record<string, unknown>)['errors'] = result.error.issues.map((i) => ({
    field: i.path.join('.') || '(body)',
    message: i.message,
  }));
  throw error;
}
