import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { ProblemFilter } from '../../src/common/errors/problem.filter';
import { IDENTITY_PROVIDER, type IdentityProvider } from '../../src/ports';
import { PersonRepository } from '../../src/persistence/person.repository';
import { InterestRepository } from '../../src/persistence/interest.repository';
import { ulid } from 'ulid';

export interface Harness {
  app: INestApplication;
  module: TestingModule;
  token(userId: string, opts?: { isOperator?: boolean }): Promise<string>;
  createPerson(handle: string): Promise<string>;
  topInterestId(): Promise<string>;
  close(): Promise<void>;
}

/** Boots the real app against DynamoDB Local and MinIO - no mocks below HTTP. */
export async function bootHarness(): Promise<Harness> {
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix('v1');
  app.useGlobalFilters(new ProblemFilter());
  await app.init();

  const identity = module.get<IdentityProvider>(IDENTITY_PROVIDER);
  const people = module.get(PersonRepository);
  const interests = module.get(InterestRepository);

  return {
    app,
    module,
    token: (userId, opts) => identity.issueForTesting!(userId, opts),
    async createPerson(handle: string) {
      const userId = ulid();
      await people.create({
        userId,
        handle: `${handle}${userId.slice(-6).toLowerCase()}`,
        displayName: handle,
        followerCount: 0,
        followingCount: 0,
        interestFollowCount: 0,
        notificationPrefs: { reaction: true, comment: true, follow: true },
        status: 'active',
        createdAt: new Date().toISOString(),
      });
      return userId;
    },
    async topInterestId() {
      const page = await interests.listChildren(null, { limit: 1 });
      const first = page.items[0];
      if (!first) throw new Error('catalogue is empty - run `pnpm --filter @sih/infra seed:catalogue`');
      return first.interestId;
    },
    close: async () => {
      await app.close();
    },
  };
}
