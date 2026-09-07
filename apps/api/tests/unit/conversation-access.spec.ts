import {
  ConversationAccess,
  type ConversationState,
  type ConversationForAccess,
} from '../../src/conversations/conversation-access';

/**
 * ===========================================================================
 * THIS SUITE IS THE CONVERSATION ACCESS CONTRACT.
 * ===========================================================================
 *
 * Generated from 004/contracts/visibility-matrix-addendum.md Part 2.
 * 6 conversation states x 4 viewer relationships x 2 operations = 48 assertions.
 *
 * Constitution II is written about POST reads, so it does not bind a
 * conversation. Its rationale does: "six independently written predicates give
 * six chances to leak, and the leak is silent and privacy-affecting." A
 * conversation is the most private thing this product holds, so it gets one
 * boundary and one generated table, exactly as VisibilityFilter does.
 *
 * Written before the module exists. It MUST fail on first run.
 */

const INITIATOR = 'person-initiator';
const RECIPIENT = 'person-recipient';

const VIEWERS = {
  initiator: INITIATOR,
  recipient: RECIPIENT,
  outsider: 'person-outsider',
  anon: null,
} satisfies Record<string, string | null>;

type ViewerKey = keyof typeof VIEWERS;

/**
 * The six states. `participantInactive` and `messageRemoved` are not values of
 * `state` - they are an accepted conversation with one extra fact - which is why
 * each row carries the whole conversation rather than just a string.
 */
const STATES = {
  requested: { state: 'requested' },
  accepted: { state: 'accepted' },
  declined: { state: 'declined' },
  severed: { state: 'severed' },
  'participant not active': { state: 'accepted', participantInactive: true },
  'message removed by moderation': { state: 'accepted' },
} as const satisfies Record<string, { state: ConversationState; participantInactive?: boolean }>;

type StateKey = keyof typeof STATES;

/** The decision table from the addendum. [read, write]. */
const EXPECTED: Record<StateKey, Record<ViewerKey, [boolean, boolean]>> = {
  //                                  initiator      recipient      outsider        anon
  requested:                      { initiator: [true, true],  recipient: [true, true],  outsider: [false, false], anon: [false, false] },
  accepted:                       { initiator: [true, true],  recipient: [true, true],  outsider: [false, false], anon: [false, false] },
  // A declined sender may still READ their own side. They may not write: the send
  // is accepted by the API and discarded, so the boundary says no and the
  // controller turns that one case into 202 rather than 404 (FR-005).
  declined:                       { initiator: [true, false], recipient: [true, false], outsider: [false, false], anon: [false, false] },
  // A block severs symmetrically. It does not matter who blocked whom, and the
  // refusal is identical from both sides so the block is not disclosed (FR-006).
  severed:                        { initiator: [false, false], recipient: [false, false], outsider: [false, false], anon: [false, false] },
  // A departed participant leaves a read-only thread - consistent with 001's
  // rule that a non-active author's followers-only content goes immediately.
  'participant not active':       { initiator: [true, false], recipient: [true, false], outsider: [false, false], anon: [false, false] },
  // Moderation removes CONTENT. It does not silently close a conversation,
  // which would be indistinguishable from a bug to both participants. The body
  // withholding is a presenter concern and is asserted separately.
  'message removed by moderation': { initiator: [true, true], recipient: [true, true], outsider: [false, false], anon: [false, false] },
};

const conversation = (state: StateKey): ConversationForAccess => ({
  conversationId: 'conv-1',
  participantIds: [INITIATOR, RECIPIENT],
  initiatorId: INITIATOR,
  ...STATES[state],
});

let assertionsRun = 0;

describe('ConversationAccess - the single membership boundary', () => {
  const access = new ConversationAccess();

  for (const state of Object.keys(STATES) as StateKey[]) {
    describe(`state: ${state}`, () => {
      for (const viewerKey of Object.keys(VIEWERS) as ViewerKey[]) {
        const [canRead, canWrite] = EXPECTED[state][viewerKey];

        it(`${viewerKey} -> read ${canRead ? 'allowed' : 'refused'}`, () => {
          expect(access.canRead(VIEWERS[viewerKey], conversation(state))).toBe(canRead);
          assertionsRun++;
        });

        it(`${viewerKey} -> write ${canWrite ? 'allowed' : 'refused'}`, () => {
          expect(access.canWrite(VIEWERS[viewerKey], conversation(state))).toBe(canWrite);
          assertionsRun++;
        });
      }
    });
  }

  afterAll(() => {
    console.log(`\nConversationAccess contract: ${assertionsRun}/48 assertions run\n`);
  });
});

describe('the refusals that must not disclose anything', () => {
  const access = new ConversationAccess();

  it('a severed conversation is refused identically from both sides (FR-006)', () => {
    const c = conversation('severed');
    expect(access.refusal(INITIATOR, c)).toEqual(access.refusal(RECIPIENT, c));
  });

  it('a severed conversation is refused exactly as a non-existent one, so a block is not disclosed', () => {
    expect(access.refusal(INITIATOR, conversation('severed'))).toBe('not-found');
    expect(access.refusal('anyone', null)).toBe('not-found');
  });

  it('an outsider gets not-found, never forbidden - membership is not disclosed', () => {
    expect(access.refusal(VIEWERS.outsider, conversation('accepted'))).toBe('not-found');
  });

  it('an anonymous viewer is told to sign in, which discloses nothing about the conversation', () => {
    expect(access.refusal(null, conversation('accepted'))).toBe('unauthenticated');
  });

  /**
   * The one place this boundary deliberately diverges from every other write in
   * the product, which refuses loudly. Same reasoning as 001's "a block returns
   * 404, indistinguishable from deletion": a sender who learns they were
   * declined has a reason to come back with another account.
   */
  it('a declined sender is told nothing - the write is discarded, not refused (FR-005)', () => {
    expect(access.refusal(INITIATOR, conversation('declined'))).toBe('silently-discarded');
  });
});

describe('the one-unanswered-message rule (FR-005, FR-008)', () => {
  const access = new ConversationAccess();

  it('the initiator may send the first message into a requested conversation', () => {
    expect(access.canSendNow(INITIATOR, conversation('requested'), { initiatorMessageCount: 0 })).toBe(true);
  });

  it('and may not send a second before it is answered', () => {
    expect(access.canSendNow(INITIATOR, conversation('requested'), { initiatorMessageCount: 1 })).toBe(false);
  });

  it('while the recipient is never rate-gated by that rule - replying is what accepts', () => {
    expect(access.canSendNow(RECIPIENT, conversation('requested'), { initiatorMessageCount: 1 })).toBe(true);
  });

  it('and the rule does not apply once the conversation is accepted', () => {
    expect(access.canSendNow(INITIATOR, conversation('accepted'), { initiatorMessageCount: 9 })).toBe(true);
  });
});
