import request from 'supertest';
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
    async topInterestId() {
      /**
       * 013. FILTERED TO `active`, and the reason is worth keeping.
       *
       * This read `listChildren(null)`, which returned only TOP-LEVEL interests
       * — all of them seeded and alive. `listAll` returns the flat catalogue,
       * which includes the merged and retired ones other suites leave behind,
       * and the alphabetically first happened to be `retired`. Publishing into
       * it is correctly refused with 422, so ~40 unrelated suites failed at
       * their first publish with no apparent connection to interests.
       *
       * A lookup that silently changed what it returns, which is the same shape
       * as a constraint and a lookup disagreeing about what a name is.
       */
      const page = await interests.listAll({ limit: 200 });
      const first = page.items.find((i) => i.state === 'active');
      if (!first) throw new Error('catalogue is empty - publish a post naming an interest (013: there is no seeded catalogue)');
      return first.interestId;
    },
    close: async () => {
      await app.close();
    },
  };
}
