import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { emptyStateCopy } from '../features/feed/HomeFeedScreen';
import { emptyInboxCopy } from '../features/conversations/InboxScreen';

/**
 * 006 GATES G4 and FR-024. WHAT A REDESIGN QUIETLY DELETES.
 *
 * Two things go missing when somebody tidies a screen, and neither shows up as a
 * failing test unless one is written for it.
 *
 * G4 - Constitution Principle IV, safety ships WITH the product. Report and
 * block are secondary controls on every surface, and "cleaning up" a card is
 * precisely how a Report button becomes an icon nobody finds. The rule is that
 * they stay reachable in the same number of taps, so the guard is that they
 * still EXIST as controls, on every surface that had them.
 *
 * FR-024 - distinct empty states. 001/FR-036 gave each surface its own wording
 * because "no messages yet" and "no requests" are not the same state: one
 * invites you to start a conversation, the other is good news. Collapsing them
 * into one generic line is the single easiest thing to do while making a UI look
 * consistent.
 */
const SRC = join(__dirname, '..');

const strip = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

describe('T041 safety controls survive the redesign (G4)', () => {
  /**
   * These ids are what `.maestro/09-report-and-block.yaml` and the browser
   * journeys select. The testID snapshot guarantees the STRING survives; this
   * guarantees it is still on something a person can press.
   */
  const REQUIRED = [
    'report-message-',
    'report-review-',
    'report-place',
    'report-description',
    'report-reasons',
  ];

  it.each(REQUIRED)('%s is still rendered somewhere in the app', (id) => {
    const found = filesUnder(SRC).some((f) => strip(readFileSync(f, 'utf8')).includes(id));
    expect(found).toBe(true);
  });

  it('every report control is a pressable, not decoration', () => {
    const offenders: string[] = [];
    for (const file of filesUnder(SRC)) {
      const src = strip(readFileSync(file, 'utf8'));
      if (!/testID=[{"'`]*report-/.test(src)) continue;
      // The file renders a report control, so it must render something pressable.
      if (!/<Pressable|<Button|onPress/.test(src)) offenders.push(file.slice(file.indexOf('src/')));
    }
    expect(offenders).toEqual([]);
  });
});

describe('T042 empty states stay distinct (FR-024)', () => {
  it('the feed says something different for each reason it is empty', () => {
    // The real hints. The first version of this test invented `'no-follows'` and
    // `null`, which is a test asserting about a state the product does not have
    // - it failed for its own reason rather than the product's.
    const noInterests = emptyStateCopy('no_followed_interests');
    const noPosts = emptyStateCopy('no_posts_yet');
    expect(noInterests).not.toBeNull();
    expect(noPosts).not.toBeNull();
    expect(noInterests!.title).not.toBe(noPosts!.title);
    expect(noInterests!.body).not.toBe(noPosts!.body);
    // And each offers the action that fits ITS reason, not one generic button.
    expect(noInterests!.action).not.toBe(noPosts!.action);
  });

  it('an unexplained empty feed gets no invented copy', () => {
    // `null` is correct: with no hint from the server there is nothing true to
    // say, and a generic line would be a guess shown to a person.
    expect(emptyStateCopy(null)).toBeNull();
  });

  it('an empty Requests inbox does not read like an empty Messages inbox', () => {
    const requests = emptyInboxCopy('requested');
    const messages = emptyInboxCopy('accepted');
    expect(requests.title).not.toBe(messages.title);
    expect(requests.body).not.toBe(messages.body);
  });

  it('no empty state has been reduced to a bare placeholder', () => {
    for (const copy of [
      emptyStateCopy('no_followed_interests')!,
      emptyStateCopy('no_posts_yet')!,
      emptyInboxCopy('requested'),
      emptyInboxCopy('accepted'),
    ]) {
      // A title alone is a label; the body is the sentence that says what to do.
      expect(copy.body.length).toBeGreaterThan(20);
    }
  });
});
