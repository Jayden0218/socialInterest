import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { AppData } from '../data';
import { DataProvider } from '../data-provider';
import { PickInterestsContainer } from '../screens';

/**
 * 007/FR-014, FR-015 — A CONTAINER TEST, NOT A SCREEN TEST.
 *
 * 003 found that `ProfileContainer` loaded the wrong person, hardcoded
 * `viewerIsFollowing: false` and had a follow button wired to `() => undefined`
 * — and nothing caught it, because every test rendered `ProfileScreen` directly
 * with props. That proves the screen works and says nothing about whether
 * anything calls it correctly.
 *
 * So this drives the CONTAINER: what it reads, what it sends, and when it
 * decides not to ask at all.
 */
describe('PickInterestsContainer', () => {
  const interest = (interestId: string, name: string) => ({
    interestId,
    name,
    slug: name.toLowerCase(),
    level: 'top' as const,
    postCount: 0,
    followerCount: 0,
    state: 'active' as const,
  });

  const build = (over: {
    seedInterests?: string[];
    coldStartComplete?: boolean;
    chooseSeedInterests?: jest.Mock;
    listTop?: () => Promise<unknown>;
  } = {}) => {
    const chooseSeedInterests =
      over.chooseSeedInterests ?? jest.fn(async () => ({ seedInterests: [] }));
    const data = {
      interests: {
        listTop:
          over.listTop ??
          (async () => ({
            items: [interest('i1', 'Bouldering'), interest('i2', 'Ramen')],
            nextCursor: null,
          })),
      },
      signals: {
        disclosure: async () => ({
          interests: [],
          seedInterests: over.seedInterests ?? [],
          coldStartComplete: over.coldStartComplete ?? (over.seedInterests ?? []).length > 0,
          collected: [],
        }),
        chooseSeedInterests,
      },
    } as unknown as AppData;
    return { data, chooseSeedInterests };
  };

  const renderWith = async (data: AppData, onDone = jest.fn()) => {
    render(
      <DataProvider value={data}>
        <PickInterestsContainer onDone={onDone} />
      </DataProvider>,
    );
    // Settle the effect's promise chain INSIDE act, rather than wrapping
    // `render` itself: wrapping the render unmounts the tree before the
    // assertions run and every test fails with "Can't access .root".
    await act(async () => undefined);
    return onDone;
  };

  it('sends the picks as SEED INTERESTS, not as follows', async () => {
    const { data, chooseSeedInterests } = build();
    const onDone = await renderWith(data);

    await act(async () => {
      fireEvent.press(screen.getByTestId('pick-i1'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('pick-continue'));
    });

    /**
     * Through `chooseSeedInterests`, which writes its own item type. Research
     * R4: storing these as interest follows is the easy path and would quietly
     * recreate the subscription feed 007 removes, because every later reader
     * treats a follow as a follow. The distinction is invisible on screen and
     * this is where it is asserted.
     */
    expect(chooseSeedInterests).toHaveBeenCalledWith(['i1']);
    expect(onDone).toHaveBeenCalled();
  });

  it('skipping RECORDS the answer, and still finishes (FR-014, FR-015)', async () => {
    const { data, chooseSeedInterests } = build();
    const onDone = await renderWith(data);

    await act(async () => {
      fireEvent.press(screen.getByTestId('pick-skip'));
    });

    /**
     * An EMPTY list is still an answer, and it is written.
     *
     * The first version sent nothing at all, which reads as thrift and is a
     * defect: the server then cannot tell "skipped" from "never asked", both
     * being an empty `seedInterests`, so this screen reappears on every
     * sign-in. A first-run screen that comes back is the app forgetting you.
     */
    expect(chooseSeedInterests).toHaveBeenCalledWith([]);
    // Not a lesser path: the feed is populated by exploration regardless, so
    // there is nothing to repair afterwards and nothing to argue about.
    expect(onDone).toHaveBeenCalled();
  });

  it('does not ask an account that has already answered', async () => {
    const { data, chooseSeedInterests } = build({ seedInterests: ['i7'], coldStartComplete: true });
    const onDone = await renderWith(data);

    // A first-run screen that reappears is the app forgetting you.
    expect(screen.queryByTestId('pick-interests-screen')).toBeNull();
    expect(chooseSeedInterests).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });

  it('a failed seed write does not trap somebody on their first screen', async () => {
    const failing = jest.fn(async () => {
      throw new Error('offline');
    });
    const { data } = build({ chooseSeedInterests: failing as never });
    const onDone = await renderWith(data);

    await act(async () => {
      fireEvent.press(screen.getByTestId('pick-i2'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('pick-continue'));
    });

    // The feed still works — it starts from exploration instead of from a hint,
    // which FR-015 already requires it to survive. Blocking sign-up on this
    // would be strictly worse than the thing it protects.
    expect(failing).toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });

  it('does not ask again somebody who SKIPPED, which picks nothing at all', async () => {
    // The case reading `seedInterests.length` gets wrong: an empty list from a
    // person who answered "none" is indistinguishable from one who was never
    // asked, and only the record tells them apart.
    const { data, chooseSeedInterests } = build({ seedInterests: [], coldStartComplete: true });
    const onDone = await renderWith(data);

    expect(screen.queryByTestId('pick-interests-screen')).toBeNull();
    expect(chooseSeedInterests).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });

  it('a catalogue that will not load does not become a dead first screen', async () => {
    const { data } = build({
      listTop: async () => {
        throw new Error('down');
      },
    });
    const onDone = await renderWith(data);
    expect(onDone).toHaveBeenCalled();
  });

  it('toggling a pick off removes it', async () => {
    const { data, chooseSeedInterests } = build();
    await renderWith(data);

    await act(async () => {
      fireEvent.press(screen.getByTestId('pick-i1'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('pick-i2'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('pick-i1'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('pick-continue'));
    });

    expect(chooseSeedInterests).toHaveBeenCalledWith(['i2']);
  });
});
