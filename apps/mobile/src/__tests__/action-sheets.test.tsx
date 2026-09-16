import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { DataProvider } from '../data-provider';
import { fakeData } from './fixtures/app-data';
import { singleImagePost } from './fixtures/post';
import { PostDetailContainer } from '../screens/PostDetailContainer';
import { ProfileContainer } from '../screens/ProfileContainer';

/**
 * 012/T034, Constitution IV. THE SAFETY ACTIONS ARE ONE TAP FROM A LABELLED
 * CONTROL, AND EVERY ROW IN THE SHEET SAYS WHAT IT IS.
 *
 * The task's framing is the thing to avoid: "report and block currently sit
 * behind an unlabelled ⋯". So this asserts labels, not only presence — an icon
 * with no word is what an unlabelled glyph looks like once it is inside a sheet
 * instead of on a toolbar.
 *
 * It also asserts what the sheets DO NOT offer. "Mute" and "Not interested" on
 * your own post are controls that cannot mean anything, and a sheet full of
 * rows that do nothing is how a person learns to stop reading them.
 */
const noop = (): void => undefined;

describe('012/T034 — the post and person action sheets', () => {
  /**
   * The shared fake's `posts.get` answers `null` — a deliberate default, since
   * most suites here are about something else. A test about post detail has to
   * give it a post.
   */
  const withPost = () => fakeData({ posts: { get: async () => singleImagePost } });

  it('a post offers share, save, dismiss, mute and report, from a labelled control', async () => {
    const data = withPost();
    const r = render(
      <DataProvider value={data}>
        <PostDetailContainer
          postId="p1"
          onOpenComments={noop}
          onReport={noop}
          onShare={noop}
          onEdit={noop}
        />
      </DataProvider>,
    );
    await waitFor(() => expect(r.queryByTestId('open-safety')).not.toBeNull());

    // LABELLED, per T034 — the control that opens it is a word, not a glyph.
    expect(r.queryByText('More')).not.toBeNull();

    // Closed until asked: a sheet that is up on arrival is a screen.
    expect(r.queryByTestId('sheet-report')).toBeNull();

    fireEvent.press(r.getByTestId('open-safety'));
    await waitFor(() => expect(r.queryByTestId('post-actions')).not.toBeNull());

    /**
     * BY ROW ID, AND THEN BY THE ROW'S OWN LABEL. `queryByText` alone finds
     * "Message" twice on a profile — the pill and the sheet row — which is a
     * test asserting the screen rather than the sheet.
     */
    for (const [key, label] of [
      ['share', 'Share'],
      ['save', 'Save to a collection'],
      ['dismiss', 'Not interested'],
      ['report', 'Report post'],
    ] as const) {
      const row = r.getByTestId(`sheet-${key}`);
      expect(row.props.accessibilityLabel).toBe(label);
    }
    // The author's handle is IN the mute row, so it is obvious who it acts on.
    expect(r.getByTestId('sheet-mute').props.accessibilityLabel).toMatch(/^Mute @/);
    // 012/FR-018. A visible way out, not only the backdrop.
    expect(r.queryByTestId('post-actions-close')).not.toBeNull();
  });

  it('pressing a row closes the sheet and performs the action', async () => {
    const data = withPost();
    let shared: string | null = null;
    const r = render(
      <DataProvider value={data}>
        <PostDetailContainer
          postId="p1"
          onOpenComments={noop}
          onReport={noop}
          onShare={(id) => {
            shared = id;
          }}
          onEdit={noop}
        />
      </DataProvider>,
    );
    await waitFor(() => expect(r.queryByTestId('open-safety')).not.toBeNull());
    fireEvent.press(r.getByTestId('open-safety'));
    await waitFor(() => expect(r.queryByTestId('sheet-share')).not.toBeNull());

    fireEvent.press(r.getByTestId('sheet-share'));
    expect(shared).toBe('p1');
    // CLOSED FIRST, so a row that navigates does not leave a sheet floating
    // over the screen it opened.
    await waitFor(() => expect(r.queryByTestId('sheet-share')).toBeNull());
  });

  /**
   * A PERSON CAN BE MUTED AND BLOCKED FROM THEIR PROFILE, which they could not
   * be at all before this: the only route was through one of their posts, via a
   * button labelled Report.
   */
  it('a profile offers mute and block, and its own way out', async () => {
    const data = fakeData();
    const r = render(
      <DataProvider value={data}>
        <ProfileContainer handle="jo" isSelf={false} onOpenPost={noop} onMessage={noop} />
      </DataProvider>,
    );
    await waitFor(() => expect(r.queryByTestId('open-person-actions')).not.toBeNull());

    fireEvent.press(r.getByTestId('open-person-actions'));
    await waitFor(() => expect(r.queryByTestId('person-actions')).not.toBeNull());

    expect(r.getByTestId('sheet-mute').props.accessibilityLabel).toBe('Mute');
    expect(r.getByTestId('sheet-block').props.accessibilityLabel).toBe('Block');
    expect(r.getByTestId('sheet-message').props.accessibilityLabel).toBe('Message');
    expect(r.queryByTestId('person-actions-close')).not.toBeNull();
  });

  /**
   * AND IT IS NOT OFFERED ON YOUR OWN PROFILE. Muting yourself is not a thing,
   * and a sheet whose every row is meaningless is worse than no sheet.
   */
  it('your own profile has no person actions', async () => {
    const data = fakeData();
    const r = render(
      <DataProvider value={data}>
        <ProfileContainer handle="me" isSelf onOpenPost={noop} />
      </DataProvider>,
    );
    await act(async () => undefined);
    expect(r.queryByTestId('open-person-actions')).toBeNull();
  });
});
