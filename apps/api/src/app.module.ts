import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AdaptersModule } from './adapters/adapters.module';
import { PersistenceModule } from './persistence/persistence.module';
import { AuthGuard } from './common/auth/auth.guard';
import { RateLimitGuard } from './common/rate-limit/rate-limit.guard';
import { LoggerMiddleware } from './common/logging/logger.middleware';
import { VisibilityFilter } from './visibility/visibility.filter';
import { HealthController } from './modules/health/health.controller';
import {
  CATALOGUE_SEARCH,
  InMemoryCatalogueCache,
} from './modules/interests/catalogue.cache';

@Module({
  imports: [AdaptersModule, PersistenceModule],
  controllers: [HealthController],
  providers: [
    VisibilityFilter,
    InMemoryCatalogueCache,
    { provide: CATALOGUE_SEARCH, useExisting: InMemoryCatalogueCache },
    // Auth runs before rate limiting so the limiter keys on the person, not the IP.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
  exports: [VisibilityFilter, CATALOGUE_SEARCH],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LoggerMiddleware).forRoutes('{*path}');
  }
}
