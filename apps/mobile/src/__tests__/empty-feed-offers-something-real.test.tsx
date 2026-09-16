import { render, waitFor } from '@testing-library/react-native';
import { DataProvider } from '../data-provider';
import { HomeFeedContainer } from '../screens/HomeFeedContainer';
import { fakeData } from './fixtures/app-data';

/**
 * 012/T042-T044, FR-019 to FR-021. AN EMPTY FEED MUST OFFER SOMETHING THAT
 * EXISTS FOR THE PERSON LOOKING AT IT.
 *
 * FR-020 asks for "a next action available to that person"; FR-021 for one that
 * "visibly changes the feed" when taken. The empty state offered "Explore
 * interests" unconditionally — and since 013 the product ships with no
 * interests of its own, so on a new install that control opens a second empty
 * room and changes nothing. Both halves of the requirement failed on exactly
 * the install the requirement is about.
 *
 * T044 asked for the answer to be DECIDED and recorded, and ruled out the
 * shortcut first: "`seed:demo` is a development tool and borrowing it would be
 * answering a product question with a script". So a newcomer is not given
 * somebody else's content — they are given the one action that is theirs.
 */
describe('a feed with nothing in it offers a next action that works', () => {
  const emptyFeed = { items: [], page: { nextCursor: null, emptyStateHint: null } };

  it('offers Explore while there is something to explore', async () => {
    const data = fakeData({
      feed: { home: async () => emptyFeed, following: async () => emptyFeed },
      interests: {
        listTop: async () => ({
          items: [{ interestId: 'i1', name: 'Birding', slug: 'birding', postCount: 3, followerCount: 0, state: 'active' }],
          page: { nextCursor: null, emptyStateHint: null },
        }),
      },
    });
    const r = render(
      <DataProvider value={data}>
        <HomeFeedContainer onEmptyAction={() => undefined} onCompose={() => undefined} onOpenPost={() => undefined} />
      </DataProvider>,
    );
    await waitFor(() => expect(r.queryByTestId('feed-empty')).not.toBeNull());
    expect(r.queryByText('Explore interests')).not.toBeNull();
    expect(r.queryByText('Share your first photo')).toBeNull();
  });

  it('offers publishing when there is nothing to explore either', async () => {
    const data = fakeData({
      feed: { home: async () => emptyFeed, following: async () => emptyFeed },
      interests: { listTop: async () => ({ items: [], page: { nextCursor: null, emptyStateHint: null } }) },
    });
    const r = render(
      <DataProvider value={data}>
        <HomeFeedContainer onEmptyAction={() => undefined} onCompose={() => undefined} onOpenPost={() => undefined} />
      </DataProvider>,
    );
    await waitFor(() => expect(r.queryByText('Share your first photo')).not.toBeNull());
    expect(r.queryByText('Explore interests')).toBeNull();
  });

  /**
   * A CATALOGUE LOOKUP THAT IS DOWN MUST NOT DECIDE THIS.
   *
   * The failure direction matters: "nothing to explore" is the more alarming
   * message and is the one a dropped request must NOT produce. A person on a
   * populated install with a flaky connection would otherwise be told nobody
   * has ever posted.
   */
  it('falls back to Explore when it cannot tell', async () => {
    const data = fakeData({
      feed: { home: async () => emptyFeed, following: async () => emptyFeed },
      interests: {
        listTop: async () => {
          throw new Error('offline');
        },
      },
    });
    const r = render(
      <DataProvider value={data}>
        <HomeFeedContainer onEmptyAction={() => undefined} onCompose={() => undefined} onOpenPost={() => undefined} />
      </DataProvider>,
    );
    await waitFor(() => expect(r.queryByTestId('feed-empty')).not.toBeNull());
    expect(r.queryByText('Explore interests')).not.toBeNull();
  });
});
