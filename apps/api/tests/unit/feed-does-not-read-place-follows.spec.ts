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
describe('the home feed never consults place follows (FR-019)', () => {
  const source = readFileSync(
    resolve(__dirname, '../../src/modules/feed/feed.service.ts'),
    'utf8',
  );

  it('FeedService does not import PlaceFollowRepository', () => {
    expect(source).not.toMatch(/PlaceFollowRepository/);
  });

  it('FeedService does not reference places at all', () => {
    // Deliberately broad. A feed that reads `placeId` to boost, group or rank by
    // place is the same violation wearing a different verb - membership and
    // prominence are both "what the viewer is shown".
    expect(source.toLowerCase()).not.toMatch(/\bplacefollow|placeid|places\./);
  });

  it('its constructor arity is unchanged, so a new dependency is a visible edit', () => {
    // A guard against the quiet version: injecting one more repository is a
    // one-line change that reads as plumbing in review.
    expect(FeedService.length).toBe(7);
  });
});
