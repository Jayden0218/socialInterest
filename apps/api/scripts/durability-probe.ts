/**
 * 010/T019 — durability, proved by hand.
 *
 * Writes a person and a post through the API's OWN classes — `PersonRepository`
 * and `PostTransaction`, the second going through `Transactor` and therefore
 * through a real `begin`/`commit` — then the container is DESTROYED (not
 * restarted) and this reads the same rows back.
 *
 * It does not go over HTTP, and that is a stated limit rather than a shortcut:
 * publishing requires an upload, and MinIO cannot be pulled in this sandbox
 * (quay.io is denied by egress). The HTTP publish path is CI's to prove.
 */
import { Pool } from 'pg';
import { PersonRepository } from '../src/persistence/person.repository';
import { PostRepository } from '../src/persistence/post.repository';
import { PostTransaction } from '../src/modules/posts/post.transaction';
import { Transactor } from '../src/persistence/transactor';

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
const people = new PersonRepository(pool, 'items');
const posts = new PostRepository(pool, 'items');
const transactor = new Transactor(pool);
const config = { dynamo: { tableName: 'items' } } as never;
const publish = new PostTransaction(transactor, config);

const userId = 'durability-t019-user';
const postId = '01T019DURABILITYPROBE00000';

async function main(): Promise<void> {
  if (process.argv[2] === 'write') {
    await people
      .create({
        userId, handle: 't019probe', displayName: 'Durability probe',
        followerCount: 0, followingCount: 0, interestFollowCount: 0,
        notificationPrefs: { reaction: true, comment: true, follow: true, message: true },
        status: 'active', createdAt: new Date().toISOString(),
      })
      .catch(() => undefined);

    const now = new Date().toISOString();
    await publish.createPost({
      post: {
        postId, authorId: userId, caption: 'this must survive the container being destroyed',
        interestIds: ['01K0PHOTOGRAPHY0000000000'], visibility: 'public',
        processingState: 'ready', reactionCount: 0, commentCount: 0,
        createdAt: now, updatedAt: now,
      } as never,
      media: [],
      expandedInterestIds: ['01K0PHOTOGRAPHY0000000000'],
    });
    console.log('wrote a person and published a post through PostTransaction');
  } else {
    const person = await people.findById(userId);
    const post = await posts.findById(postId);
    console.log('person :', person ? `@${person.handle} — "${person.displayName}"` : 'GONE');
    console.log('post   :', post ? `"${post.caption}" [${post.visibility}/${post.processingState}]` : 'GONE');
    const indexed = await pool.query(
      `select count(*)::int as n from items where gsi2pk is not null and item->>'postId' = $1`,
      [postId],
    );
    console.log('index  :', indexed.rows[0].n, 'index row(s) written in the same transaction');
  }
  await pool.end();
}
main().catch((e: unknown) => { console.error(String(e)); process.exit(1); });
