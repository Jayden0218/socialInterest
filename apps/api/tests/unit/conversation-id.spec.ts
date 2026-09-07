import { conversationIdFor, participantPair } from '../../src/modules/conversations/conversation-id';

describe('conversation id derivation (research R8)', () => {
  it('does not depend on who asked - the whole reason it is derived', () => {
    expect(conversationIdFor('alice', 'bob')).toBe(conversationIdFor('bob', 'alice'));
  });

  it('is stable across calls, so opening twice is idempotent with no uniqueness item', () => {
    expect(conversationIdFor('alice', 'bob')).toBe(conversationIdFor('alice', 'bob'));
  });

  it('separates different pairs', () => {
    expect(conversationIdFor('alice', 'bob')).not.toBe(conversationIdFor('alice', 'carol'));
  });

  it('refuses a conversation with yourself rather than producing a plausible id', () => {
    expect(() => conversationIdFor('alice', 'alice')).toThrow();
  });

  it('is url-safe, since it appears in a path', () => {
    expect(conversationIdFor('a-user', 'b user')).toMatch(/^[0-9a-f]{26}$/);
  });

  it('does not collide across a boundary - "ab" + "c" is not "a" + "bc"', () => {
    // Without a separator these concatenate to the same string. The separator in
    // the hash input is what prevents it, and ids are not fixed-width forever.
    expect(conversationIdFor('ab', 'c')).not.toBe(conversationIdFor('a', 'bc'));
  });

  it('sorts the pair the same way the id does', () => {
    expect(participantPair('bob', 'alice')).toEqual(['alice', 'bob']);
    expect(participantPair('alice', 'bob')).toEqual(['alice', 'bob']);
  });
});
