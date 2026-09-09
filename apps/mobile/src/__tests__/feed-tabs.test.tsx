import { fireEvent, render } from '@testing-library/react-native';
import { HomeFeedScreen } from '../features/feed/HomeFeedScreen';
import { multiImagePost } from './fixtures/post';

/**
 * 008/US3 — THE FOLLOWING TAB IS NO LONGER A PROMISE.
 *
 * It shipped in 007 rendered `disabled`, with a comment in the screen saying it
 * was not built. That was HONEST — it deliberately avoided repeating the defect
 * 003 found on the profile, where a follow button was wired to `() => undefined`
 * and the app could not demonstrate the premise of its own non-negotiable
 * Principle I — and it was still a control that did nothing for a whole feature.
 *
 * The test that matters here is the DISABLED one: a tab that goes back to being
 * inert would keep every other assertion in this file passing.
 */
const state = { items: [multiImagePost], loading: false, exhausted: true, hint: null } as never;

const renderFeed = (props: Partial<Parameters<typeof HomeFeedScreen>[0]> = {}) =>
  render(
    <HomeFeedScreen
      state={state}
      onLoadMore={() => undefined}
      onEmptyAction={() => undefined}
      renderPost={() => <></>}
      {...props}
    />,
  );

describe('008/FR-008 the feed tabs', () => {
  it('Following is ENABLED - the state this story exists to change', () => {
    const t = renderFeed();
    const following = t.getByTestId('feed-tab-following');
    // `disabled` absent or false, both of which mean pressable. Asserting
    // `toBe(false)` alone would fail on the correct `undefined`.
    expect(following.props.accessibilityState?.disabled).toBeFalsy();
  });

  it('pressing Following asks the caller to switch', () => {
    const chosen: string[] = [];
    const t = renderFeed({ onSelectTab: (tab) => chosen.push(tab) });
    fireEvent.press(t.getByTestId('feed-tab-following'));
    expect(chosen).toEqual(['following']);
  });

  it('pressing For you asks for the ranked feed', () => {
    const chosen: string[] = [];
    const t = renderFeed({ tab: 'following', onSelectTab: (tab) => chosen.push(tab) });
    fireEvent.press(t.getByTestId('feed-tab-for-you'));
    expect(chosen).toEqual(['for-you']);
  });

  it('exactly one tab reads as selected, whichever is showing', () => {
    for (const tab of ['for-you', 'following'] as const) {
      const t = renderFeed({ tab });
      const selected = ['feed-tab-for-you', 'feed-tab-following']
        .map((id) => t.getByTestId(id).props.accessibilityState?.selected)
        .filter(Boolean);
      // Both-selected is the bug a recoloured rule would produce, and it would
      // look right on screen while telling a screen reader something false.
      expect({ tab, selectedCount: selected.length }).toEqual({ tab, selectedCount: 1 });
    }
  });

  it('defaults to For you, so a caller that passes no tab is unchanged', () => {
    const t = renderFeed();
    expect(t.getByTestId('feed-tab-for-you').props.accessibilityState?.selected).toBe(true);
  });
});
