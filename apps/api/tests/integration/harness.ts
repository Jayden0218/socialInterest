import request from 'supertest';
import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { ProblemFilter } from '../../src/common/errors/problem.filter';
import { IDENTITY_PROVIDER, type IdentityProvider } from '../../src/ports';
import { PersonRepository } from '../../src/persistence/person.repository';
import { InterestRepository } from '../../src/persistence/interest.repository';
import { InMemoryCatalogueCache } from '../../src/modules/interests/catalogue.cache';
import { ulid } from 'ulid';

export interface Harness {
  app: INestApplication;
  module: TestingModule;
  token(userId: string, opts?: { isOperator?: boolean }): Promise<string>;
  createPerson(handle: string): Promise<string>;
  topInterestId(): Promise<string>;
  /**
   * A REAL upload id for `userId`, obtained through POST /media/uploads.
   *
   * Publishing used to accept a fabricated id and a caller-supplied key, so every
   * suite quoted `uploadId: 'u', key: 'k'`. The server now resolves the id against
   * its own record and refuses one issued to someone else, so tests must obtain a
   * genuine one - which is the behaviour a real client has anyway.
   */
  uploadId(token: string, kind?: 'image' | 'video'): Promise<string>;
  close(): Promise<void>;
}

/** Boots the real app against DynamoDB Local and MinIO - no mocks below HTTP. */
export async function bootHarness(): Promise<Harness> {
  // These suites drive media processing explicitly so they can assert specific
  // states. The real pipeline runs in apps/e2e against a real API process, which
  // is where it belongs - see MediaDispatchService.
  process.env['MEDIA_DISPATCH_ON_CREATE'] = 'false';
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
        notificationPrefs: { reaction: true, comment: true, follow: true, message: true },
        status: 'active',
        createdAt: new Date().toISOString(),
      });
      return userId;
    },
    async uploadId(token: string, kind: 'image' | 'video' = 'image') {
      const body =
        kind === 'video'
          ? { kind, contentType: 'video/mp4', sizeBytes: 5_000_000, durationMs: 30_000 }
          : { kind, contentType: 'image/jpeg', sizeBytes: 1024 };
      const res = await request(app.getHttpServer())
        .post('/v1/media/uploads')
        .set('authorization', `Bearer ${token}`)
        .send(body);
      if (res.status !== 201) {
        throw new Error(`could not obtain an upload target: ${res.status} ${res.text}`);
      }
      return res.body.uploadId as string;
    },
    /**
     * 013/T023. THE PRODUCT SHIPS NO INTERESTS, SO THE FIXTURE MAKES ONE.
     *
     * This read the seeded catalogue, which is deleted: FR-017 says the product
     * has no interests of its own, and `seed:catalogue` went with it. A test
     * that needs an interest to post into now creates one, the same way a
     * person does — by naming it.
     *
     * Reused across a run when one already exists, so suites that call this
     * repeatedly do not each add a row to a shared local table. Three
     * "regressions" in this project have been a grown table.
     */
    async topInterestId() {
      const page = await interests.listAll({ limit: 200 });
      const existing = page.items.find((i) => i.state === 'active');
      if (existing) return existing.interestId;

      const name = `Fixture ${ulid().slice(-8).toLowerCase()}`;
      const item = {
        interestId: ulid(),
        name,
        nameNormalised: name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        createdBy: 'fixture',
        postCount: 1,
        followerCount: 0,
        state: 'active' as const,
        createdAt: new Date().toISOString(),
      };
      await interests.create(item);
      await module.get(InMemoryCatalogueCache).refresh();
      return item.interestId;
    },
    close: async () => {
      await app.close();
    },
  };
}
