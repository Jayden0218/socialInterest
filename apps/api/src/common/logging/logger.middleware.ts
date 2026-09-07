import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import type { AppRequest } from '../http/request';
import { randomUUID } from 'node:crypto';

/** One structured line per request. Never logs a bearer token or request body. */
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('http');

  use(req: AppRequest, res: Response, next: NextFunction): void {
    const started = process.hrtime.bigint();
    const requestId = (req.header('x-request-id') ?? randomUUID()).slice(0, 64);
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      this.logger.log(
        JSON.stringify({
          requestId,
          method: req.method,
          path: req.route?.path ?? req.path,
          status: res.statusCode,
          durationMs: Math.round(ms * 10) / 10,
        }),
      );
    });
    next();
  }
}
