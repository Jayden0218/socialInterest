import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { EventRepository } from '../../api/src/persistence/event.repository';
import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';
import { jpegPlain } from '../support/media';
import { startApi, stopApi, killApi } from '../support/api-process';
import { baseUrl } from '../support/base-url';
import { e2eEnv } from '../support/env';
import { anInterest } from '../support/interests';

/**
 * 003/US2. The stack keeps what it is given.
 *
 * Nothing in this product has ever been shown to survive a restart. The
 * datastore ran `-inMemory`, so a restart lost every post. Object storage wrote
 * into the container's writable layer, so a recreate lost every upload. And the
 * event bus delivered on the next tick with no record, so an event published
 * before the process died was gone with no trace it had existed.
 *
 * That last one is not theoretical. In feature 002 nothing subscribed to
 * `post.created`; a post therefore never left `pending`, and a pending post is
 * visible ONLY to its author. Nobody could see anyone else's post. An event
 * lost to a crash reproduces exactly that state, for that post, permanently.
 *
 * These cases restart real processes and containers rather than simulating it.
 * A durability test that mocks the restart tests the mock.
 */
const REPO_ROOT = resolve(__dirname, '../../..');

function compose(...args: string[]): void {
  execFileSync('docker', ['compose', ...args], { cwd: REPO_ROOT, stdio: 'pipe', timeout: 180_000 });
}

async function waitForApi(): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${baseUrl()}/v1/interests?q=a`);
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error('API did not come back after the restart');
}

/**
 * Reads the outstanding-event partition directly.
 *
 * Not through the API: the point of the event case below is what is on disk at
 * the instant the process dies, and the process is dead.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 010: THIS READ WAS POINTED AT AN ENGINE THE PRODUCT NO LONGER WRITES TO
 * ────────────────────────────────────────────────────────────────────────────
 *
 * It queried DynamoDB Local with the AWS SDK. The datastore moved to Postgres
 * and this file was not among the twenty-nine repositories that moved with it,
 * so the query ran against a table nothing has written since — and answered
 * with an empty list while the product was recording events correctly.
 *
 * It did at least FAIL rather than pass: the assertion below is
 * `toHaveLength(1)`, so an empty answer is red. The clean-up assertion at the
 * end of the same case (`toHaveLength(0)`) is the half that would have passed
 * over anything, which is the shape CLAUDE.md records as a guard losing its
 * subject. Nothing caught it because `test:durability` is its own jest config
 * and needs a stack this sandbox could not start.
 *
 * `EventRepository`, not a restated key schema — the same argument
 * `support/people.ts` makes: a second copy of `EVENTS#PENDING` here would drift
 * from the product's silently and this suite would be asserting about a shape
 * nothing writes. That is exactly what just happened.
 */
const pool = new Pool({ connectionString: e2eEnv.postgresUrl });
/**
 * A POOL THAT OUTLIVES A DELIBERATE DATABASE RESTART NEEDS THIS, and finding
 * out cost the first run of this suite in the development sandbox.
 *
 * `compose down` stops Postgres, which sends every idle connection
 * `terminating connection due to administrator command`. `pg-pool` re-emits
 * that on the Pool, and a Pool with no `error` listener makes it an UNHANDLED
 * error event — so all four cases failed with a page of client internals and
 * nothing naming the restart they had just performed on purpose.
 *
 * Swallowing it is correct here rather than lax: the connection was closed by
 * the thing this suite exists to stop and start, the pool opens a new one on
 * the next query, and a failure that matters shows up as a failed assertion
 * after the restart — which is the whole point of the case.
 */
pool.on('error', () => undefined);
const events = new EventRepository(pool, e2eEnv.tableName);

async function pendingEvents(): Promise<{ type: string; payload: Record<string, unknown> }[]> {
  return events.listPending();
}

afterAll(async () => {
  await pool.end();
});

describe('durability — the stack keeps what it is given', () => {
  jest.setTimeout(600_000);

  it('data written before a full restart is readable after it', async () => {
    const author = await actor('durauthor');
    const catalogue = { items: [await anInterest(author)] };
    const interestId = catalogue.items[0]!.interestId;
    await author.data.interests.follow(interestId);
    const postId = await publishReadyImage(author, [interestId], { caption: 'survives a restart' });
    await author.data.engagement.comment(postId, 'this comment must survive');
    await author.data.engagement.react(postId);

    // Everything down, not just the API: a stack that keeps posts and loses
    // uploads has not kept what it was given.
    await stopApi();
    compose('down');
    compose('up', '-d');
    await new Promise((r) => setTimeout(r, 12_000));
    await startApi();
    await waitForApi();

    const after = await author.data.posts.get(postId);
    expect(after.caption).toBe('survives a restart');
    expect(after.interests.map((i) => i.interestId)).toContain(interestId);
    expect(after.commentCount).toBeGreaterThan(0);
    expect(after.reactionCount).toBeGreaterThan(0);

    const comments = await author.data.engagement.comments(postId, {});
    expect(comments.items.map((c) => c.body)).toContain('this comment must survive');

    // The media too. An upload that is gone is not a caveat, it is a failure.
    expect(after.media?.length ?? 0).toBeGreaterThan(0);

    const me = await author.data.session.me();
    expect(me.interestFollowCount).toBeGreaterThan(0);
  });

  it('a person who existed before the restart still exists after it', async () => {
    const person = await actor('durperson');
    await stopApi();
    compose('restart');
    await new Promise((r) => setTimeout(r, 10_000));
    await startApi();
    await waitForApi();

    // A token is only as good as the profile it refers to: if the person is
    // gone, GET /v1/me answers 404 and sign-in fails on every client.
    const me = await person.data.session.me();
    expect(me.handle).toBe(person.handle);
  });

  /**
   * T033. The case the in-process bus could never have passed.
   *
   * A post is published, and the process is SIGKILLed while the media pipeline
   * is still running. Nothing else in the system calls that pipeline - feature
   * 002 proved exactly that, when nothing subscribed to `post.created` and
   * every post stayed `pending` forever. So if the post is `ready` after the
   * restart, the only path that could have got it there is the replay.
   *
   * The kill window is real work, not a sleep: the handler fetches the object
   * from storage and runs ffmpeg in a container, which takes seconds. The
   * assertion that the record is still outstanding at kill time is what makes
   * this a test of the replay rather than a test of timing luck - if the kill
   * lands late, this fails loudly instead of passing for the wrong reason.
   */
  it('an event whose handler was killed mid-flight is replayed on restart', async () => {
    const author = await actor('durevent');
    const catalogue = { items: [await anInterest(author)] };
    const interestId = catalogue.items[0]!.interestId;

    const bytes = jpegPlain();
    const target = await author.data.posts.createUploadTarget({
      kind: 'image',
      contentType: 'image/jpeg',
      sizeBytes: bytes.byteLength,
    });
    await author.data.posts.uploadBytes(target, bytes, 'image/jpeg');
    const post = await author.data.posts.publish({
      uploadIds: [target.uploadId],
      interestIds: [interestId],
      caption: 'killed mid-pipeline',
    });

    // The publish response returns once the row is committed and the event is
    // recorded; delivery is deliberately not awaited. So this kill lands after
    // the record exists and before the handler can finish.
    await killApi();

    const outstanding = await pendingEvents();
    const mine = outstanding.filter(
      (e) => e.type === 'post.created' && e.payload['postId'] === post.postId,
    );
    expect(mine).toHaveLength(1);

    await startApi();
    await waitForApi();

    const deadline = Date.now() + 120_000;
    let state = 'pending';
    while (Date.now() < deadline) {
      state = (await author.data.posts.get(post.postId)).processingState;
      if (state === 'ready' || state === 'failed') break;
      await new Promise((r) => setTimeout(r, 500));
    }

    // `pending` here means the event was lost; `failed` means it was replayed
    // and the work genuinely failed. Only `ready` is the effect landing.
    expect(state).toBe('ready');
    const after = await author.data.posts.get(post.postId);
    expect(after.media?.length ?? 0).toBeGreaterThan(0);

    // And the record is cleared, so the next restart does not deliver it again.
    const still = (await pendingEvents()).filter((e) => e.payload['postId'] === post.postId);
    expect(still).toHaveLength(0);
  });

  /**
   * 004/SC-002. A conversation survives a full restart, in order, with nothing
   * lost.
   *
   * Worth its own case rather than trusting the post one: messages are the first
   * thing in this product stored under a DERIVED partition key and read
   * ascending with a cursor, and both of those are ways to lose or reorder rows
   * that a post read would never expose.
   */
  it('a conversation and its messages survive a full restart, in order', async () => {
    const a = await actor('durchatA');
    const b = await actor('durchatB');
    await b.data.people.follow(a.handle);

    const conv = await a.data.conversations.open(b.handle);
    const sent = ['one', 'two', 'three', 'four', 'five'];
    for (const body of sent) {
      await a.data.conversations.send(conv.conversationId, { body });
    }

    await stopApi();
    compose('down');
    compose('up', '-d');
    await new Promise((r) => setTimeout(r, 12_000));
    await startApi();
    await waitForApi();

    // The id is DERIVED, so it must still resolve after a restart without
    // anything having been stored to remember it.
    const reopened = await b.data.conversations.open(a.handle);
    expect(reopened.conversationId).toBe(conv.conversationId);

    const page = await b.data.conversations.messages(conv.conversationId, { limit: 50 });
    expect(page.items.map((m) => m.body)).toEqual(sent);

    const inbox = await b.data.conversations.list({ state: 'accepted' });
    const row = inbox.items.find((c) => c.conversationId === conv.conversationId);
    expect(row).toBeDefined();
    expect(row!.unreadCount).toBe(sent.length);
    expect(row!.lastMessagePreview).toBe('five');
  });
});
