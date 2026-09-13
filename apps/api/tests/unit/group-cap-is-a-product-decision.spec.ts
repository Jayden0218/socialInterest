/**
 * 010/T020. THE 20-PERSON GROUP CAP MUST NOT MOVE, and the reason it exists
 * just disappeared.
 *
 * 005 recorded the cap as a CORRECTNESS constraint rather than a product
 * preference: a group write is 1 meta item + 2N participant rows, so 20 people
 * is 41 items, and the old engine's transaction capped at 100. "The next size up
 * would not be a bigger group but a silently truncated one."
 *
 * Postgres has no such limit. The constraint is gone — and a constraint
 * disappearing is not permission for the number to change. 010's own contract
 * says it in as many words: *a migration may remove a constraint; it may not
 * make a product decision.* Nobody has decided how big a group should be; 20 is
 * simply what the old engine allowed.
 *
 * So this pins it, and a limit that quietly relaxed during an engine swap would
 * be indistinguishable from a bug. **Raising it is a deliberate edit to this
 * file with a product reason written beside it**, which is exactly how
 * `matrix.spec.ts` treats its own pinned totals.
 *
 * What this does NOT pin is the arithmetic: 41 items in one transaction is no
 * longer a ceiling anyone is near, so the number of ROWS a group costs is free
 * to change. Only the number of PEOPLE is pinned.
 */
import { ConversationService } from '../../src/modules/conversations/conversation.service';

describe('the group cap survived the engine change', () => {
  it('is still 20 people', () => {
    expect(ConversationService.MAX_PARTICIPANTS).toBe(20);
  });

  /**
   * And the old arithmetic, recorded rather than asserted as a live limit.
   *
   * 1 meta + 2 rows per participant = 41 items at the cap, against the old
   * engine's 100. Kept here so the next person reading "why 20?" finds the
   * answer and its expiry date in the same place, instead of finding a number
   * with no reason and assuming there never was one.
   */
  it('cost 41 items in one transaction, against a limit of 100 that no longer applies', () => {
    const itemsForAGroup = (people: number): number => 1 + 2 * people;
    expect(itemsForAGroup(ConversationService.MAX_PARTICIPANTS)).toBe(41);
    expect(itemsForAGroup(50)).toBeGreaterThan(100);
  });
});
