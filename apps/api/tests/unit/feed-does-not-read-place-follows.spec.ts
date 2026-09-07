import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FeedService } from '../../src/modules/feed/feed.service';

/**
 * 004/FR-019, Constitution I (NON-NEGOTIABLE).
 *
 * Following a place must not widen a viewer's feed beyond their followed
 * interests. SC-006 asserts that BEHAVIOURALLY, over HTTP, in two halves. This
 * asserts it STRUCTURALLY, which catches a different failure: SC-006 can only
 * fail once somebody has written the code that widens the feed and a post
 * happens to exercise it, whereas this fails the moment the dependency appears.
 *
 * The hazard is not hypothetical and it is not malicious. PlaceFollowRepository
 * exists, it knows exactly who follows a place, and "we already store this, why
 * not surface it" is how Principle I gets violated by convenience rather than by
 * decision. The repository's own file carries the same warning at its
 * definition; this is the version that fails a build.
 */
describe('the home feed never consults place follows or ratings (FR-019, 005)', () => {
  /**
   * COMMENTS STRIPPED, for a hazard this file was one edit away from.
   *
   * It matches identifiers in the feed's source. A comment in feed.service.ts
   * reading "deliberately does not consult PlaceFollowRepository" would fail this
   * guard against correct code - the same way a comment naming `message` made a
   * selector for a non-existent switch resolve in verify-maestro-ids, and the same
   * way a comment saying "MUST NOT IMPORT BlockRepository" failed the 005 guard on
   * clean source. Prose describes the intention, never the build.
   */
  const source = readFileSync(resolve(__dirname, '../../src/modules/feed/feed.service.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('FeedService does not import PlaceFollowRepository', () => {
    expect(source).not.toMatch(/PlaceFollowRepository/);
  });

  it('FeedService does not reference places at all', () => {
    // Deliberately broad. A feed that reads `placeId` to boost, group or rank by
    // place is the same violation wearing a different verb - membership and
    // prominence are both "what the viewer is shown".
    expect(source.toLowerCase()).not.toMatch(/\bplacefollow|placeid|places\./);
  });

  /**
   * 005. Reviews are author-attributed content about a place, and "show me
   * reviews from people I follow" is exactly the convenience that turns this
   * product into an ordinary follower feed. A rating is worse: it is a number
   * that would be trivially tempting to rank a feed by.
   *
   * Extended BEFORE the review read path exists (plan gate G3), so it prevents
   * the dependency rather than confirming its absence after the fact.
   */
  it('FeedService does not import the rating or review layer', () => {
    expect(source).not.toMatch(/RatingRepository|ReviewQueryService|AuthoredContentVisibility/);
  });

  it('FeedService does not reference ratings or reviews at all', () => {
    expect(source.toLowerCase()).not.toMatch(/\brating|\breview/);
  });

  it('its constructor arity is unchanged, so a new dependency is a visible edit', () => {
    // A guard against the quiet version: injecting one more repository is a
    // one-line change that reads as plumbing in review.
    expect(FeedService.length).toBe(7);
  });
});
