import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 008/T130, US9 — BOTH HALVES OF A NOTIFICATION KIND, OR NEITHER.
 *
 * This project has shipped each half without the other, twice:
 *
 *   004/FR-031  `message` was in the list that DESCRIBES notifications and not
 *               in the list the Edit-profile screen RENDERS, so the toggle did
 *               not exist. Two lists for one thing: the duplicate is not a risk
 *               of drift, it IS the drift.
 *   007         `follow` had a schema entry, a description and a toggle — and
 *               `PersonFollowService` published no event, so it was a switch
 *               for something that could never happen.
 *
 * So a kind must appear in FOUR places, and this reads the files rather than
 * trusting that they agree: a test asserting its own idea of the list would be
 * a guard reading its own prose.
 */
describe('008/US9 the mention notification kind has every half', () => {
  const read = (...parts: string[]): string =>
    readFileSync(join(__dirname, '..', '..', '..', '..', ...parts), 'utf8');

  it('is a declared kind, describable, preferable AND rendered as a switch', () => {
    const common = read('packages', 'shared', 'src', 'schemas', 'common.ts');
    const entities = read('packages', 'shared', 'src', 'types', 'entities.ts');
    const screen = read('apps', 'mobile', 'src', 'features', 'notifications', 'NotificationsScreen.tsx');

    const kindLine = /notificationKindSchema = z\.enum\(\[([^\]]*)\]/.exec(common)?.[1] ?? '';
    const prefsBlock = /notificationPreferencesSchema = z\.object\(\{([\s\S]*?)\}\)/.exec(entities)?.[1] ?? '';
    // Comments stripped: 004 reverted a file to reproduce this defect and found
    // its own comment naming the missing category made the check pass.
    const screenCode = screen.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const categories = /NOTIFICATION_CATEGORIES[\s\S]*?\[([\s\S]*?)\n\];/.exec(screenCode)?.[1] ?? '';
    const describe = /export function describeNotification[\s\S]*?\n\}/.exec(screenCode)?.[0] ?? '';

    expect({
      declaredKind: kindLine.includes("'mention'"),
      preference: /\bmention\s*:/.test(prefsBlock),
      renderedSwitch: /key:\s*'mention'/.test(categories),
      described: describe.includes("case 'mention'"),
    }).toEqual({
      declaredKind: true,
      preference: true,
      renderedSwitch: true,
      described: true,
    });
  });

  /**
   * THE FIFTH HALF, and the one 007 was missing: something has to FIRE it.
   *
   * Two links, checked separately, because either alone is a dead end: the
   * writing paths must publish the event, and the notification service must
   * turn that event into a `mention` notification. The first version of this
   * test looked for `kind: 'mention'` in the writing paths — where it correctly
   * is not, because those files publish an event and `NotificationService` owns
   * every decision about who is told.
   */
  it('and something PUBLISHES it — a toggle for an event nothing fires is 007 again', () => {
    const stripped = (src: string): string =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const comments = stripped(read('apps', 'api', 'src', 'modules', 'engagement', 'comment.service.ts'));
    /**
     * `processing.service.ts`, NOT `post.service.ts`, and this guard is how
     * that was noticed.
     *
     * A caption's mention is announced when the post becomes READY, because a
     * pending post is visible only to its author and `canOpen` would refuse
     * every mention on a fresh one — a fire-once event that always loses the
     * race with transcoding.
     */
    const posts = stripped(read('apps', 'api', 'src', 'modules', 'posts', 'processing.service.ts'));
    const notifications = stripped(
      read('apps', 'api', 'src', 'modules', 'notifications', 'notification.service.ts'),
    );
    expect({
      captionPublishes: /type:\s*'content\.mentioned'/.test(posts),
      commentPublishes: /type:\s*'content\.mentioned'/.test(comments),
      subscribed: /subscribe\('content\.mentioned'/.test(notifications),
      creates: /kind:\s*'mention'/.test(notifications),
    }).toEqual({ captionPublishes: true, commentPublishes: true, subscribed: true, creates: true });
  });
});
