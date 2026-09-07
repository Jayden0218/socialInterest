import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { DataProvider } from '../data-provider';
import { PlaceContainer } from '../screens';
import type { AppData } from '../data';

/**
 * 005/US1, THROUGH THE CONTAINER.
 *
 * A SCREEN TEST IS NOT A CONTAINER TEST, and this project has paid for that
 * distinction twice. 003/T053: `ProfileContainer` loaded only your own profile
 * whatever handle it was given, hardcoded `viewerIsFollowing: false`, and its
 * follow button was `() => undefined` - so the app could not demonstrate the
 * premise of its own non-negotiable Principle I. Every test rendered
 * `ProfileScreen` directly with props, which proves the screen works and says
 * nothing about whether anything calls it. 004 then shipped a save button whose
 * handler was declared after the container's return: dead code, and fifty green
 * mobile tests.
 *
 * So these press the real control and assert the DATA LAYER was called.
 */
const place = {
  placeId: 'PLC1',
  name: 'Tiong Bahru Bakery',
  category: 'cafe' as const,
  locality: 'Singapore',
  address: null,
  status: 'active' as const,
  mergedIntoPlaceId: null,
  followerCount: 0,
  postCount: 0,
  viewerIsFollowing: false,
  ratingSummary: { average: null, count: 0 },
  viewerRating: null,
};

function fakeData(over: Record<string, unknown> = {}): AppData {
  const page = { items: [], page: { nextCursor: null } };
  return {
    places: {
      get: async () => place,
      posts: async () => page,
      reviews: async () => page,
      rate: async () => ({ rating: null, summary: { average: 4, count: 1 } }),
      withdrawRating: async () => undefined,
      follow: async () => undefined,
      unfollow: async () => undefined,
      ...(over['places'] ?? {}),
    },
  } as unknown as AppData;
}

const renderPlace = (data: AppData, signedIn = true) =>
  render(
    <DataProvider value={data}>
      <PlaceContainer
        placeId="PLC1"
        signedIn={signedIn}
        onOpenPost={() => undefined}
        onReport={() => undefined}
      />
    </DataProvider>,
  );

describe('PlaceContainer — rating (005/US1)', () => {
  it('sends the chosen score to the data layer when a star is pressed', async () => {
    const rate = jest.fn(async () => ({ rating: null, summary: { average: 4, count: 1 } }));
    const data = fakeData({ places: { rate } });
    renderPlace(data);
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('rating-star-4'));
    });

    // The SCORE, and the place - not just "something was called".
    expect(rate).toHaveBeenCalledWith('PLC1', expect.objectContaining({ score: 4 }));
  });

  it('sends the review text along with the score', async () => {
    const rate = jest.fn(async () => ({ rating: null, summary: { average: 5, count: 1 } }));
    const data = fakeData({ places: { rate } });
    renderPlace(data);
    await act(async () => {
      await Promise.resolve();
    });

    // TWO acts, deliberately. Batching the typing and the press into one means
    // the press runs against the render that existed BEFORE the text landed, so
    // the handler closes over an empty body. That is a property of the test, not
    // of the app - a person types, the screen re-renders, and then they tap.
    // Collapsing them would have "found" a bug that does not exist.
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('review-body-input'), '  Excellent kaya toast.  ');
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('rating-star-5'));
    });

    // Trimmed. A body of whitespace is not a review, and storing one puts an
    // empty row on the place page.
    expect(rate).toHaveBeenCalledWith('PLC1', { score: 5, body: 'Excellent kaya toast.' });
  });

  it('sends null rather than an empty string when there is no text (FR-009)', async () => {
    const rate = jest.fn(async () => ({ rating: null, summary: { average: 3, count: 1 } }));
    const data = fakeData({ places: { rate } });
    renderPlace(data);
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('rating-star-3'));
    });
    expect(rate).toHaveBeenCalledWith('PLC1', { score: 3, body: null });
  });

  it('withdraws through the data layer, not by clearing local state', async () => {
    const withdrawRating = jest.fn(async () => undefined);
    const data = fakeData({
      places: {
        withdrawRating,
        get: async () => ({ ...place, viewerRating: 3, ratingSummary: { average: 3, count: 1 } }),
      },
    });
    renderPlace(data);
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId('withdraw-rating'));
    });
    expect(withdrawRating).toHaveBeenCalledWith('PLC1');
  });

  /** FR-006. The control is not merely disabled - it is not there to press. */
  it('offers no rating control at all when signed out', async () => {
    renderPlace(fakeData(), false);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('rating-star-1')).toBeNull();
    expect(screen.getByTestId('rating-signed-out')).toBeTruthy();
  });

  /**
   * FR-005 at the last possible moment. The API sends `average: null` to keep
   * "unrated" and "rated badly" different facts; a component rendering
   * `average ?? 0` would undo that in the view and put "0.0" on every new place.
   */
  it('renders an unrated place as unrated, never as 0.0', async () => {
    renderPlace(fakeData());
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('rating-summary')).toHaveTextContent(/Not yet rated/);
    expect(screen.getByTestId('rating-summary')).not.toHaveTextContent(/0\.0/);
  });

  it('reads the summary back from the server after rating', async () => {
    const get = jest
      .fn()
      .mockResolvedValueOnce(place)
      .mockResolvedValue({ ...place, viewerRating: 4, ratingSummary: { average: 4, count: 1 } });
    const data = fakeData({ places: { get } });
    renderPlace(data);
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('rating-star-4'));
    });
    // The reload is a second round trip after the write resolves, so it needs a
    // second flush before the new summary is on screen.
    await act(async () => {
      await Promise.resolve();
    });

    // Re-read, not assumed from a 200. The container must not paint a summary it
    // computed itself - that is how a star flips locally while the server
    // rejected the write.
    expect(get.mock.calls.length).toBeGreaterThan(1);
    expect(screen.getByTestId('rating-summary')).toHaveTextContent(/4\.0/);
  });
});
