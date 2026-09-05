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
  await app.listen(config.port);
  new Logger('bootstrap').log(`API listening on :${config.port} (profile=${config.profile})`);
}

void bootstrap();
