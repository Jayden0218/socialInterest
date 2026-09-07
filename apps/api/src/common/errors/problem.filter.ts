import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  errors?: { field: string; message: string }[];
  /**
   * RFC 9457 permits extension members, and some responses depend on them - the
   * near-duplicate 409 carries `candidates` so the client can offer "join this
   * one instead" (FR-023). The filter must pass them through rather than
   * rebuilding the body from known keys only.
   */
  [extension: string]: unknown;
}

/** Domain errors that map onto a specific status without leaking internals. */
export class DomainError extends HttpException {
  /**
   * `extensions` become RFC 9457 extension members on the problem document.
   *
   * Added for 004/FR-014: a duplicate place is a 409 that CARRIES the existing
   * place, so the client attaches that one instead of creating a second. A bare
   * rejection sends the person back to a form with no way to do the right thing,
   * which is how duplicates happen.
   */
  constructor(
    status: HttpStatus,
    title: string,
    detail?: string,
    extensions: Record<string, unknown> = {},
    readonly problemType = 'about:blank',
  ) {
    super({ title, detail, ...extensions }, status);
  }
}

@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let title = 'Internal Server Error';
    let detail: string | undefined;
    let errors: Problem['errors'];
    let extensions: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        title = body;
      } else if (body && typeof body === 'object') {
        const { title: t, error, detail: d, errors: e, message, statusCode, ...rest } =
          body as Record<string, unknown>;
        title = (t as string) ?? (error as string) ?? exception.message;
        detail = d as string | undefined;
        errors = e as Problem['errors'];
        // Anything else the thrower attached is an RFC 9457 extension member.
        extensions = rest;
        void message;
        void statusCode;
      }
    } else {
      // Never surface an unexpected error's message to the caller.
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    const problem: Problem = {
      type: exception instanceof DomainError ? exception.problemType : 'about:blank',
      title,
      status,
      ...(detail ? { detail } : {}),
      ...(errors ? { errors } : {}),
      ...extensions,
    };

    res.status(status).type('application/problem+json').send(problem);
    void req;
  }
}
