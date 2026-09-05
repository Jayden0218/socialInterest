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
}

/** Domain errors that map onto a specific status without leaking internals. */
export class DomainError extends HttpException {
  constructor(status: HttpStatus, title: string, detail?: string, readonly problemType = 'about:blank') {
    super({ title, detail }, status);
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

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        title = body;
      } else if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        title = (b['title'] as string) ?? (b['error'] as string) ?? exception.message;
        detail = b['detail'] as string | undefined;
        errors = b['errors'] as Problem['errors'];
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
    };

    res.status(status).type('application/problem+json').send(problem);
    void req;
  }
}
