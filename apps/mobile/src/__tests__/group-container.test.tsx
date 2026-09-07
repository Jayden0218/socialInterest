import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { DataProvider } from '../data-provider';
import { ConversationContainer, InboxContainer, NewGroupContainer } from '../screens';
import type { AppData } from '../data';
import { DataError } from '../data/errors';

/**
 * 005/US3, THROUGH THE CONTAINERS.
 *
 * A screen test is not a container test. 003/T053 shipped a `ProfileContainer`
 * that hardcoded `viewerIsFollowing: false` and whose follow button was
 * `() => undefined`, and every test rendered `ProfileScreen` directly with
 * props - which proves the screen works and says nothing about whether anything
 * calls it. 004 then shipped a save handler declared after the container's
 * return: dead code, fifty green mobile tests.
 *
 * So these press the real controls and assert the DATA LAYER was called with the
 * right arguments.
 */
const person = (handle: string) => ({
  userId: `u-${handle}`,
  handle,
  displayName: handle[0]!.toUpperCase() + handle.slice(1),
  bio: null,
  followerCount: 0,
  followingCount: 0,
  postCount: 0,
  interestFollowCount: 0,
  viewerIsFollowing: false,
  status: 'active' as const,
});

const group = {
  conversationId: 'CONV-GROUP',
  other: null,
  kind: 'group' as const,
  name: 'Climbing Tuesday',
  state: 'accepted' as const,
  lastMessageAt: '2026-01-01T00:00:00Z',
  lastMessagePreview: null,
  unreadCount: 0,
  viewerCanSend: true,
  initiatedByViewer: true,
  participants: [
    { person: person('me'), state: 'accepted' as const, joinedAt: '2026-01-01T00:00:00Z' },
    { person: person('bo'), state: 'requested' as const, joinedAt: '2026-01-01T00:00:00Z' },
  ],
};

const pair = {
  ...group,
  conversationId: 'CONV-PAIR',
  other: person('bo'),
  kind: 'pair' as const,
  name: null,
  participants: undefined,
};

/**
 * A LONG POLL THAT RETURNS IMMEDIATELY IS NOT A LONG POLL.
 *
 * `ConversationContainer` re-issues `messages` as soon as each request settles,
 * so exactly one is in flight and delivery is sub-second (FR-011). A stub that
 * resolves instantly turns that loop into a microtask spin: the event loop is
 * starved, so jest's own `testTimeout` never fires either, and the run hangs
 * with NO output rather than failing. That is what the first version of this
 * file did, and the timeout was invisible until the call was counted.
 *
 * So the first call answers and every one after it HANGS, which is what the
 * server does while it waits for a message. The screen renders and the poll
 * parks, exactly as in the app.
 */
function pollOnce<T>(first: T): () => Promise<T> {
  let served = false;
  return () => {
    if (served) return new Promise<T>(() => undefined);
    served = true;
    return Promise.resolve(first);
  };
}

function fakeData(over: Record<string, Record<string, unknown>> = {}): AppData {
  const empty = { items: [], page: { nextCursor: null } };
  return {
    session: { me: async () => person('me') },
    people: {
      search: async () => ({ items: [person('alice'), person('bo')] }),
      ...(over['people'] ?? {}),
    },
    conversations: {
      list: async () => empty,
      get: async () => group,
      messages: pollOnce(empty),
      markRead: async () => undefined,
      send: async () => undefined,
      accept: async () => undefined,
      decline: async () => undefined,
      createGroup: async () => group,
      addParticipant: async () => undefined,
      leave: async () => undefined,
      ...(over['conversations'] ?? {}),
    },
  } as unknown as AppData;
}

const settle = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe('NewGroupContainer — creating a group (005/FR-018)', () => {
  const renderNew = (data: AppData, onCreated = jest.fn()) => {
    render(
      <DataProvider value={data}>
        <NewGroupContainer onCreated={onCreated} />
      </DataProvider>,
    );
    return onCreated;
  };

  /**
   * The search is debounced, so a typed query needs the timer to fire before the
   * results exist. Faking timers rather than waiting 250ms keeps the suite fast
   * AND deterministic - a real 250ms wait is a test that passes on a fast
   * machine, which is the shape of defect 004 found four times.
   */
  const search = async (q: string) => {
    jest.useFakeTimers();
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('group-search-input'), q);
    });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    jest.useRealTimers();
    await settle();
  };

  it('sends the chosen handles and the name to the data layer', async () => {
    const createGroup = jest.fn(async () => group);
    renderNew(fakeData({ conversations: { createGroup } }));
    await settle();
    await search('a');

    await act(async () => {
      fireEvent.press(screen.getByTestId('group-participant-alice'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('group-participant-bo'));
    });
    // A separate act from the presses: the name lands in state, the screen
    // re-renders, and only then is Create pressed. Batching them would make the
    // handler close over the name that existed before it was typed.
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('group-name-input'), '  Climbing Tuesday  ');
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('create-group'));
    });

    expect(createGroup).toHaveBeenCalledWith({
      participantHandles: ['alice', 'bo'],
      name: 'Climbing Tuesday',
    });
  });

  it('sends a null name rather than an empty string when none was typed', async () => {
    const createGroup = jest.fn(async () => group);
    renderNew(fakeData({ conversations: { createGroup } }));
    await settle();
    await search('a');
    await act(async () => {
      fireEvent.press(screen.getByTestId('group-participant-alice'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('group-participant-bo'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('create-group'));
    });
    expect(createGroup).toHaveBeenCalledWith({
      participantHandles: ['alice', 'bo'],
      name: null,
    });
  });

  it('cannot be created with nobody chosen', async () => {
    const createGroup = jest.fn(async () => group);
    renderNew(fakeData({ conversations: { createGroup } }));
    await settle();
    await act(async () => {
      fireEvent.press(screen.getByTestId('create-group'));
    });
    expect(createGroup).not.toHaveBeenCalled();
    // And it SAYS why. A disabled button with no explanation is 004's publish
    // defect: the tap was a silent no-op that looked like a frozen app.
    expect(screen.getByTestId('new-group-notice')).toBeTruthy();
  });

  /**
   * FR-027 is not an error and must not read like one: one other person is a
   * pair, and the server routes it to the conversation you already have.
   */
  it('warns that one person opens the existing conversation rather than refusing', async () => {
    renderNew(fakeData());
    await settle();
    await search('a');
    await act(async () => {
      fireEvent.press(screen.getByTestId('group-participant-alice'));
    });
    expect(screen.getByTestId('new-group-notice')).toHaveTextContent(/existing conversation/i);
    // Still creatable - the server decides, not this screen.
    expect(screen.queryByTestId('new-group-error')).toBeNull();
  });

  /**
   * FR-023. The SERVER's refusal, shown as it was worded.
   *
   * The wording deliberately does not say who blocked whom, and a client that
   * replaced it with its own friendlier copy would be free to disclose exactly
   * what the refusal was written to withhold.
   */
  it('shows the server refusal verbatim when a participant cannot be added', async () => {
    const createGroup = jest.fn(async () => {
      throw new DataError(409, {
        title: 'That person cannot be added to this conversation',
        status: 409,
      });
    });
    renderNew(fakeData({ conversations: { createGroup } }));
    await settle();
    await search('a');
    await act(async () => {
      fireEvent.press(screen.getByTestId('group-participant-alice'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('group-participant-bo'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('create-group'));
    });

    expect(screen.getByTestId('new-group-error')).toHaveTextContent(
      'That person cannot be added to this conversation',
    );
  });
});

describe('ConversationContainer — leaving a group (005/FR-021)', () => {
  const renderConversation = (data: AppData, onLeft = jest.fn()) => {
    render(
      <DataProvider value={data}>
        <ConversationContainer
          conversationId="CONV-GROUP"
          onOpenPost={() => undefined}
          onReport={() => undefined}
          onLeft={onLeft}
        />
      </DataProvider>,
    );
    return onLeft;
  };

  it('leaves through the data layer and hands over', async () => {
    const leave = jest.fn(async () => undefined);
    const onLeft = renderConversation(fakeData({ conversations: { leave } }));
    await settle();

    await act(async () => {
      fireEvent.press(screen.getByTestId('leave-group'));
    });

    expect(leave).toHaveBeenCalledWith('CONV-GROUP');
    // Handing over matters: leaving makes the conversation a 404 to you, so
    // staying on the screen means the next poll paints a refusal where the thing
    // you just asked for should be.
    expect(onLeft).toHaveBeenCalled();
  });

  it('adds somebody by handle through the data layer', async () => {
    const addParticipant = jest.fn(async () => undefined);
    const get = jest.fn(async () => group);
    renderConversation(fakeData({ conversations: { addParticipant, get } }));
    await settle();

    // Two acts: the handle lands in state and the screen re-renders before Add
    // is pressed. Batching them makes the handler close over the empty string
    // that existed before the typing - a property of the test, not of the app.
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('add-participant-input'), '  @Alice  ');
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('add-participant'));
    });

    // Trimmed and unprefixed: `@alice` is how a handle is WRITTEN, not what it
    // is, and the API takes the handle.
    expect(addParticipant).toHaveBeenCalledWith('CONV-GROUP', 'Alice');
    // Re-read, not painted locally. The server decides who is in the group, and
    // a container that appended the member itself would show one the
    // transaction had refused.
    expect(get.mock.calls.length).toBeGreaterThan(1);
  });

  it('shows the add refusal verbatim rather than a friendlier guess (FR-023)', async () => {
    const addParticipant = jest.fn(async () => {
      throw new DataError(409, {
        title: 'That person cannot be added to this conversation',
        status: 409,
      });
    });
    renderConversation(fakeData({ conversations: { addParticipant } }));
    await settle();
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('add-participant-input'), 'alice');
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('add-participant'));
    });
    expect(screen.getByTestId('add-participant-error')).toHaveTextContent(
      'That person cannot be added to this conversation',
    );
  });

  it('offers no leave control on a pair, which has nothing to leave', async () => {
    renderConversation(fakeData({ conversations: { get: async () => pair } }));
    await settle();
    expect(screen.queryByTestId('leave-group')).toBeNull();
    expect(screen.queryByTestId('group-participants')).toBeNull();
    // Nor an add control: a pair's id is derived from the two people in it
    // (R1), so a third participant would have to change the id - see J-41.
    expect(screen.queryByTestId('add-participant')).toBeNull();
  });

  /**
   * FR-019, FR-024. Who is in here, by name - and somebody who left is listed as
   * having left rather than dropped, so a message from them still has an author
   * the reader can place.
   */
  it('names the participants, marking anyone who left', async () => {
    renderConversation(
      fakeData({
        conversations: {
          get: async () => ({
            ...group,
            participants: [
              ...group.participants,
              { person: person('jo'), state: 'left' as const, joinedAt: '2026-01-01T00:00:00Z' },
            ],
          }),
        },
      }),
    );
    await settle();
    const participants = screen.getByTestId('group-participants');
    // Regexes, not strings: `toHaveTextContent` with a string is an EXACT
    // match on the whole node, so three of them could only ever pass if the
    // element said nothing else.
    expect(participants).toHaveTextContent(/\bMe\b/);
    expect(participants).toHaveTextContent(/\bBo\b/);
    expect(participants).toHaveTextContent(/Jo \(left\)/);
  });
});

describe('InboxContainer — group rows (005/FR-024)', () => {
  it('identifies a group by its name, never by the last message', async () => {
    render(
      <DataProvider
        value={fakeData({
          conversations: {
            list: async () => ({
              items: [{ ...group, lastMessagePreview: 'see you there' }],
              page: { nextCursor: null },
            }),
          },
        })}
      >
        <InboxContainer onOpen={() => undefined} onNewGroup={() => undefined} />
      </DataProvider>,
    );
    await settle();

    // The row is FOUND by its identity. 004's `14-message-request` waited on a
    // last-message preview and passed twice on incidental ordering; a preview is
    // mutable by definition.
    expect(screen.getByTestId('group-row-Climbing Tuesday')).toBeTruthy();
  });

  it('offers the new-group entry point', async () => {
    const onNewGroup = jest.fn();
    render(
      <DataProvider value={fakeData()}>
        <InboxContainer onOpen={() => undefined} onNewGroup={onNewGroup} />
      </DataProvider>,
    );
    await settle();
    await act(async () => {
      fireEvent.press(screen.getByTestId('new-group'));
    });
    expect(onNewGroup).toHaveBeenCalled();
  });
});
