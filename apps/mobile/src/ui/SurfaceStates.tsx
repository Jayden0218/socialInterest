import type { ReactElement } from 'react';
import type { PagedResult } from '../containers/usePaged';
import { EmptyState, FailedState, FeedSkeleton, ListSkeleton } from './states';
import type { IconName } from './icons';

/**
 * THE STATE THAT STANDS IN FOR A SURFACE'S CONTENT — 012/FR-001, FR-002.
 *
 * `usePaged` DECIDES which of the four; this DRAWS it. Keeping those apart is
 * the point: the decision is one rule every surface shares, while the drawing
 * differs — a feed's placeholder is two columns of cards, an inbox's is a
 * column of rows.
 *
 * IT RETURNS A FALLBACK, IT DOES NOT WRAP THE SCREEN, and the first version got
 * that wrong in a way the tests caught immediately. Wrapping replaced the whole
 * screen with the state, which took the chrome with it: the inbox lost its
 * "new group" control and the feed lost its For You / Following switcher — so
 * an empty feed offered no way to change that it was empty, which is FR-007
 * failing in the act of implementing FR-002. `States.dc.html` draws the header
 * above every one of the three states, and it is right.
 *
 * So a screen renders its chrome, then renders this where the list goes, and
 * falls through to the list when it comes back `null`.
 */
export interface EmptyCopy {
  /** From the icon set. `States.dc.html` puts one at the centre. */
  icon?: IconName;
  title: string;
  /**
   * FR-007: what to DO, not only that there is nothing.
   *
   * FR-011 BOUNDS THIS, and it is the one place a less helpful message is the
   * correct one: an empty list caused by a block or a privacy rule must NOT say
   * so. Constitution II makes absence and refusal deliberately
   * indistinguishable, so a considerate empty state here would be an oracle —
   * answering a question the boundary refuses to answer. Copy passed here says
   * what the PERSON can do, never why the list is short.
   */
  body: string;
  /** FR-008: offered only when the person can actually do it. */
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * `null` means "there is content — render the list".
 *
 * A function rather than a component so a screen can put it exactly where the
 * list would sit, under whatever chrome that screen owns.
 */
export function surfaceFallback<T>(
  result: PagedResult<T>,
  opts: {
    shape: 'feed' | 'list';
    empty: EmptyCopy;
    /**
     * THREE LITERAL IDS, NOT A PREFIX TO BUILD THEM FROM — and this is a
     * PARTIAL fix, which is worth stating precisely because I first wrote that
     * it was a complete one.
     *
     * `${testID}-empty` was the first version, and the testID snapshot caught
     * it inside a minute: a composed id is invisible to every source-scanning
     * guard, `verify-maestro-ids` included, which reads literals and cannot see
     * through a template. That blind spot cost 005 three attempts at one inbox
     * row and broke a selector twenty minutes into run 48.
     *
     * Literals here are greppable, which the template was not. But the snapshot
     * guard scans two POSITIONS — `testID=` in JSX and `testID:` in a spread
     * object — and these are in neither, so it still cannot see them and
     * `inbox-empty` reads to it as removed. It was updated deliberately, in the
     * same commit, which is what that guard's own instructions say to do.
     *
     * The limitation is real: if a Maestro flow ever selects one of these,
     * `verify-maestro-ids` will not resolve it. No flow does today. Anything
     * that needs to be selected on a device should be passed at the call site
     * in a `testID=` position instead of through here.
     */
    ids: { loading: string; empty: string; failed: string };
  },
): ReactElement | null {
  const { shape, empty, ids } = opts;

  if (result.surface === 'loading') {
    return shape === 'feed' ? (
      <FeedSkeleton testID={ids.loading} />
    ) : (
      <ListSkeleton testID={ids.loading} />
    );
  }

  if (result.surface === 'failed') {
    return (
      <FailedState
        testID={ids.failed}
        message={result.error ?? 'Something went wrong.'}
        onRetry={result.reload}
      />
    );
  }

  if (result.surface === 'empty') {
    return (
      <EmptyState
        testID={ids.empty}
        title={empty.title}
        body={empty.body}
        {...(empty.icon ? { icon: empty.icon } : {})}
        {...(empty.actionLabel ? { actionLabel: empty.actionLabel } : {})}
        {...(empty.onAction ? { onAction: empty.onAction } : {})}
      />
    );
  }

  return null;
}
