import { keys, SK_PREFIX, ITEM_TYPE_005 } from '../../src/persistence/keys';

/**
 * The key strings 005 adds, asserted literally.
 *
 * A key mismatch is SILENT: a query against the wrong partition returns nothing,
 * which is indistinguishable from "there is nothing there". No integration test
 * fails in a way that names the cause - the feature just quietly has no data. So
 * these assert the exact strings in data-model.md rather than round-tripping
 * through the builders, which would pass against any consistent typo.
 */
describe('005 key schema', () => {
  it('a rating lives in its place partition, keyed by the rater', () => {
    expect(keys.rating('PLC1', 'U1')).toEqual({ pk: 'PLACE#PLC1', sk: 'RATING#U1' });
  });

  /**
   * FR-002 is enforced HERE, not in a service.
   *
   * Two ratings by the same person for the same place compute the same key, so a
   * second one overwrites rather than adds. This asserts that property directly:
   * if the sk ever gains a timestamp or an id, "at most one rating per person per
   * place" silently becomes "unlimited ratings" and every average is wrong.
   */
  it('the same person rating the same place twice writes the same key (FR-002)', () => {
    expect(keys.rating('PLC1', 'U1')).toEqual(keys.rating('PLC1', 'U1'));
    expect(keys.rating('PLC1', 'U1').sk).not.toContain('#20');
  });

  it('a person can be asked what they rated, from their own partition', () => {
    expect(keys.ratingByPerson('U1', 'PLC1')).toEqual({ pk: 'USER#U1', sk: 'RATED#PLC1' });
  });

  /**
   * The place partition holds posts AND ratings now. A prefix that matched both
   * would make a place's review list include its posts, and a post list include
   * its ratings - both as rows with the wrong shape.
   */
  it('the rating prefix cannot collide with the post prefix in a place partition', () => {
    const ratings = keys.ratingPrefix('PLC1');
    const posts = keys.postPlaceIndexPrefix('PLC1');
    expect(ratings.pk).toBe(posts.pk);
    expect(ratings.skPrefix).toBe('RATING#');
    expect(posts.skPrefix).toBe('POST#');
    expect(ratings.skPrefix.startsWith(posts.skPrefix)).toBe(false);
    expect(posts.skPrefix.startsWith(ratings.skPrefix)).toBe(false);
  });

  it('a conversation member is queryable from the conversation partition (A40)', () => {
    expect(keys.conversationMember('CV1', 'U1')).toEqual({
      pk: 'CONV#CV1',
      sk: 'PARTICIPANT#U1',
    });
    expect(keys.conversationMemberPrefix('CV1')).toEqual({
      pk: 'CONV#CV1',
      skPrefix: 'PARTICIPANT#',
    });
  });

  /**
   * The conversation partition already holds `#META` and `MSG#...`. A member
   * prefix that collided with the message prefix would put participant rows in
   * the message list, where they would be rendered as messages with no body.
   */
  it('the member prefix cannot collide with the message prefix', () => {
    const members = keys.conversationMemberPrefix('CV1');
    expect(members.skPrefix).toBe('PARTICIPANT#');
    expect(SK_PREFIX.message).toBe('MSG#');
    expect(members.skPrefix.startsWith(SK_PREFIX.message)).toBe(false);
    expect(SK_PREFIX.message.startsWith(members.skPrefix)).toBe(false);
  });

  it('exposes the prefixes and discriminators the repositories use', () => {
    expect(SK_PREFIX.rating).toBe('RATING#');
    expect(SK_PREFIX.conversationMember).toBe('PARTICIPANT#');
    expect(ITEM_TYPE_005.rating).toBe('rating');
    expect(ITEM_TYPE_005.conversationMember).toBe('conversation-member');
  });
});
