import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 005/R2. THE MOVED AUTHORITY MUST NOT COME BACK.
 *
 * `state` used to live on the conversation item, with the participant rows
 * carrying a copy. A group has no single state - Alice accepted, Bob has not
 * looked, Jo declined - so the authority moved to the participant row, and the
 * meta item's field is now written and never read for a decision.
 *
 * The failure this prevents is quiet and plausible: somebody adds
 * `conversation.state === 'accepted'` to a new read path because it is right
 * there on the item they already loaded. It would work for every pair and be
 * wrong for every group, and no test that only exercises pairs would notice.
 *
 * Structural, for the same reason as the feed guard: it fails when the
 * DEPENDENCY appears, which is earlier than a behavioural test can manage.
 */
const SRC = join(__dirname, '../../src');

/**
 * Comments stripped. Three guards in this repository have now been written that
 * matched their own prose - `verify-maestro-ids` resolving a selector because a
 * comment named the value, and the 005 block guard failing on clean source
 * because the file said "MUST NOT IMPORT BlockRepository". A guard that reads
 * prose describes the intention, not the build.
 */
const read = (rel: string) =>
  readFileSync(join(SRC, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('the conversation item is no longer the authority for state (005/R2)', () => {
  /**
   * The one legitimate reader is `forAccess`, which hands the value to the pure
   * boundary as a FALLBACK for legacy rows that have no participant state. That
   * is FR-026 working, not the authority coming back - and the fallback is
   * visible as `viewerState ?? state` in the boundary itself.
   */
  it('the service reads the participant state and never decides from the view state directly', () => {
    const src = read('modules/conversations/conversation.service.ts');
    expect(src).toMatch(/participantState\(/);
    expect(src).toMatch(/this\.access\.stateOf\(/);

    /**
     * THE RULE THAT CAUGHT THREE LIVE DEFECTS.
     *
     * `view.state` is the META item's state, and asking it directly is right for
     * every pair and wrong for every group. Three sites did: the message-count
     * gate, the reply-accepts rule and accept/decline. The last called
     * `setState`, which writes EVERY participant row - so one invitee accepting
     * a group invitation accepted it for the people who had not looked and the
     * one who declined.
     *
     * Counting reads of `item.state` was the first version of this and it was
     * the wrong shape: it could not tell a read from a write, and the legitimate
     * FR-026 fallback read is indistinguishable from a new offender. The
     * question that matters is whether a DECISION is made from it.
     */
    expect(src).not.toMatch(/\bview\.state\s*[!=]==/);
    expect(src).not.toMatch(/\bloaded\.view\.state\s*[!=]==/);

    // The meta item is read in exactly one place - the fallback handed to the
    // boundary - and written in exactly one, the pair branch of `setStateFor`.
    const fallbackRead = (src.match(/:\s*item\.state/g) ?? []).length;
    expect(fallbackRead).toBe(1);
  });

  /**
   * And the group branch must not use the pair writer. `setState` fans out
   * across every participant row by design (that IS the pair semantics, and what
   * a legacy row needs), which makes it the single most dangerous call to reach
   * for from a group path.
   */
  it('a group state change writes only the one participant row', () => {
    const src = read('modules/conversations/conversation.service.ts');
    const branch = /if \(view\.kind === 'group'\) \{[\s\S]*?\n    \}/.exec(src)?.[0] ?? '';
    expect(branch).toMatch(/setParticipantState\(/);
    expect(branch).not.toMatch(/this\.conversations\.setState\(/);
  });

  it('the pure boundary prefers the viewer state over the conversation state', () => {
    const src = read('conversations/conversation-access.ts');
    expect(src).toMatch(/conversation\.viewerState \?\? conversation\.state/);
    // And that precedence is expressed ONCE - a rule repeated at six call sites
    // is a rule that will eventually be applied differently at one of them.
    const precedence = (src.match(/viewerState \?\? conversation\.state/g) ?? []).length;
    expect(precedence).toBe(1);
  });

  /**
   * No OTHER module may consult it. A read path that reached for
   * `conversation.state` would be right for pairs and wrong for groups.
   */
  it('no other module decides anything from the conversation item state', () => {
    for (const file of [
      'modules/conversations/message.service.ts',
      'modules/conversations/conversation.controller.ts',
    ]) {
      let src: string;
      try {
        src = read(file);
      } catch {
        continue; // The file may not exist; that is not a failure of this rule.
      }
      expect(src).not.toMatch(/\.state === '(requested|accepted|declined|severed)'/);
    }
  });

  /**
   * And the backfill must never touch a group. Its first version offered to
   * "repair" 21 group participant rows by copying the meta item's placeholder
   * over states that were correct - which would have turned every pending group
   * invitation into an accepted one, silently, for everybody. Found by running
   * the dry run rather than trusting the script.
   */
  it('the backfill skips groups', () => {
    const src = readFileSync(join(__dirname, '../../scripts/backfill-conversation-state.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(src).toMatch(/kind'\] === 'group'/);
  });
});
