import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { ProblemFilter } from './common/errors/problem.filter';
import { CONFIG, type AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  app.setGlobalPrefix('v1');
  app.useGlobalFilters(new ProblemFilter());

  const config = app.get<AppConfig>(CONFIG);

  /**
   * BOUND EXPLICITLY TO EVERY INTERFACE, not left to the framework's default.
   *
   * The default already does this, and that is exactly why it is worth pinning:
   * "it happens to work" and "it is meant to work" look identical until
   * something changes underneath them, and the failure lands somewhere expensive
   * — a phone on the same Wi-Fi getting connection refused, with nothing in any
   * log to say why, because from the server's point of view nothing went wrong.
   *
   * A managed host also needs this: several inject the port as `PORT` and route
   * to the container's external address, and a service listening on loopback
   * there is a deploy that goes green and answers nothing.
   */
  await app.listen(config.port, '0.0.0.0');
  new Logger('bootstrap').log(
    `API listening on 0.0.0.0:${config.port} (profile=${config.profile})`,
  );
}

void bootstrap();
