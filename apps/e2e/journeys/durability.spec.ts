import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';
import { startApi, stopApi } from '../support/api-process';
import { baseUrl } from '../support/base-url';

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

describe('durability — the stack keeps what it is given', () => {
  jest.setTimeout(600_000);

  it('data written before a full restart is readable after it', async () => {
    const author = await actor('durauthor');
    const catalogue = await author.data.interests.listTop({ limit: 1 });
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
});
