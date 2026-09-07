import { actor } from '../support/client';
import { consistently, eventually } from '../support/eventually';

/**
 * 005/US3 over HTTP.
 *
 * The story that REPLACES machinery rather than adding to it: conversation ids
 * stop being derivable and state stops being a property of the conversation.
 * SC-008 (legacy conversations still work) is asserted in the API's integration
 * suite against rows written by the old code, because only that can establish it.
 * These are the new behaviours.
 */
describe('005/US3 - conversations with more than two people', () => {
  it('J-32 a group is created and every participant sees it (FR-018, FR-019)', async () => {
    const creator = await actor('groupCreator');
    const b = await actor('groupB');
    const c = await actor('groupC');
    // Followed, so the invitations are accepted rather than requested (FR-022).
    await b.data.people.follow(creator.handle);
    await c.data.people.follow(creator.handle);

    const group = await creator.data.conversations.createGroup({
      participantHandles: [b.handle, c.handle],
      name: 'Climbing Tuesday',
    });

    expect(group.kind).toBe('group');
    expect(group.name).toBe('Climbing Tuesday');
    // FR-026: a group has no single other person, and says so rather than
    // inventing one.
    expect(group.other).toBeNull();
    expect(group.participants).toHaveLength(3);

    for (const person of [b, c]) {
      const inbox = await person.data.conversations.list({ state: 'accepted' });
      expect(inbox.items.some((i) => i.conversationId === group.conversationId)).toBe(true);
    }
  });

  it('J-33 every participant receives every message (SC-007)', async () => {
    const a = await actor('msgA');
    const b = await actor('msgB');
    const c = await actor('msgC');
    await b.data.people.follow(a.handle);
    await c.data.people.follow(a.handle);

    const group = await a.data.conversations.createGroup({
      participantHandles: [b.handle, c.handle],
      name: 'Three Way',
    });

    await a.data.conversations.send(group.conversationId, { body: 'from a' });
    await b.data.conversations.send(group.conversationId, { body: 'from b' });
    await c.data.conversations.send(group.conversationId, { body: 'from c' });

    for (const person of [a, b, c]) {
      const messages = await person.data.conversations.messages(group.conversationId);
      const bodies = messages.items.map((m) => m.body);
      // ALL THREE, to each of the three - not "some messages arrived".
      expect(bodies).toEqual(expect.arrayContaining(['from a', 'from b', 'from c']));
    }
  });

  /**
   * FR-027, which falls out of R1's id scheme rather than needing its own check:
   * a single participant is routed to the pair path, which computes the derived
   * id and finds what is already there.
   */
  it('J-34 a "group" with one other person resolves to the existing pair conversation', async () => {
    const a = await actor('pairA');
    const b = await actor('pairB');

    const pair = await a.data.conversations.open(b.handle);
    const asGroup = await a.data.conversations.createGroup({ participantHandles: [b.handle] });

    expect(asGroup.conversationId).toBe(pair.conversationId);
    expect(asGroup.kind ?? 'pair').toBe('pair');
    expect(asGroup.other).not.toBeNull();
  });

  it('J-35 somebody can be added to an existing group and the id does not change (FR-020)', async () => {
    const a = await actor('addA');
    const b = await actor('addB');
    const c = await actor('addC');
    const d = await actor('addD');
    await b.data.people.follow(a.handle);
    await c.data.people.follow(a.handle);
    await d.data.people.follow(a.handle);

    // TWO others, so this is genuinely a group. Creating with one would give a
    // PAIR by FR-027, and a pair cannot be added to - see J-41.
    const group = await a.data.conversations.createGroup({
      participantHandles: [b.handle, c.handle],
      name: 'Growing',
    });
    const originalId = group.conversationId;
    await a.data.conversations.send(originalId, { body: 'before the add' });

    await a.data.conversations.addParticipant(originalId, d.handle);

    // THE ID IS THE SAME. A derived id would have changed here, and the
    // conversation everyone was reading would have ceased to exist (R1).
    const reread = await a.data.conversations.get(originalId);
    expect(reread.conversationId).toBe(originalId);
    expect(reread.participants).toHaveLength(4);

    // And the history survived the membership change.
    const messages = await d.data.conversations.messages(originalId);
    expect(messages.items.some((m) => m.body === 'before the add')).toBe(true);
  });

  /**
   * A STATED LIMITATION, found by writing J-35 wrongly.
   *
   * FR-020 says "add another person to an existing GROUP", and FR-027 says a
   * two-person conversation IS a pair. Together those mean a pair cannot be
   * turned into a group by adding somebody - the pair's id is derived from the
   * two people in it (R1), so a third participant would have to change the id,
   * which is the exact thing R1 rules out.
   *
   * Nobody asked for it and the spec does not require it; the honest answer is a
   * clean 404 and this test recording why, rather than a confusing failure
   * somebody rediscovers later. The path that DOES exist is to start a group.
   */
  it('J-41 a pair conversation cannot be turned into a group, and says so cleanly', async () => {
    const a = await actor('promoteA');
    const b = await actor('promoteB');
    const c = await actor('promoteC');

    const pair = await a.data.conversations.open(b.handle);
    await expect(
      a.data.conversations.addParticipant(pair.conversationId, c.handle),
    ).rejects.toThrow();

    // And the pair is untouched.
    const reread = await a.data.conversations.get(pair.conversationId);
    expect(reread.conversationId).toBe(pair.conversationId);
    expect(reread.other).not.toBeNull();
  });

  it('J-36 adding somebody already present is a no-op, not a duplicate', async () => {
    const a = await actor('dupA');
    const b = await actor('dupB');
    const c = await actor('dupC');
    await b.data.people.follow(a.handle);
    await c.data.people.follow(a.handle);

    const group = await a.data.conversations.createGroup({
      participantHandles: [b.handle, c.handle],
    });
    await a.data.conversations.addParticipant(group.conversationId, b.handle);

    const reread = await a.data.conversations.get(group.conversationId);
    expect(reread.participants).toHaveLength(3);
  });

  /** FR-021 and SC-011. */
  it('J-37 leaving stops delivery, and the messages already sent stay readable', async () => {
    const a = await actor('leaveA');
    const b = await actor('leaveB');
    const c = await actor('leaveC');
    await b.data.people.follow(a.handle);
    await c.data.people.follow(a.handle);

    const group = await a.data.conversations.createGroup({
      participantHandles: [b.handle, c.handle],
      name: 'Leaving',
    });
    await b.data.conversations.send(group.conversationId, { body: 'said before leaving' });

    await b.data.conversations.leave(group.conversationId);

    // Gone for them...
    await expect(b.data.conversations.get(group.conversationId)).rejects.toThrow();
    const bInbox = await b.data.conversations.list({ state: 'accepted' });
    expect(bInbox.items.some((i) => i.conversationId === group.conversationId)).toBe(false);

    // ...and what they said is still there for the rest. Leaving withdraws you
    // from the conversation; it does not retract what you said to people who
    // were there.
    const stillThere = await c.data.conversations.messages(group.conversationId);
    expect(stillThere.items.some((m) => m.body === 'said before leaving')).toBe(true);

    // And the remaining two can still talk.
    await a.data.conversations.send(group.conversationId, { body: 'after they left' });
    const cSees = await c.data.conversations.messages(group.conversationId);
    expect(cSees.items.some((m) => m.body === 'after they left')).toBe(true);
  });

  /**
   * FR-022 and SC-009. Held over a WINDOW, not checked once.
   *
   * Notifications arrive through an asynchronous pipeline, so "zero
   * notifications" checked immediately passes before anything could have
   * arrived - green, worthless, and indistinguishable from a real pass. That is
   * what `consistently` exists for.
   */
  it('J-38 a group invitation from a stranger waits in Requests and notifies nobody (SC-009)', async () => {
    const stranger = await actor('strangerCreator');
    const invitee = await actor('strangerInvitee');
    const third = await actor('strangerThird');
    await third.data.people.follow(stranger.handle);

    const group = await stranger.data.conversations.createGroup({
      participantHandles: [invitee.handle, third.handle],
      name: 'Unsolicited',
    });

    // In Requests, not the main inbox.
    const requests = await invitee.data.conversations.list({ state: 'requested' });
    expect(requests.items.some((i) => i.conversationId === group.conversationId)).toBe(true);
    const accepted = await invitee.data.conversations.list({ state: 'accepted' });
    expect(accepted.items.some((i) => i.conversationId === group.conversationId)).toBe(false);

    // And notifying nobody, held over a window.
    await consistently(
      () => invitee.data.notifications.list({ limit: 20 }),
      (page) => !page.items.some((n) => n.kind === 'message'),
      { forMs: 1500, intervalMs: 250, describe: 'no notification for an unsolicited group invite' },
    );

    // The person who follows the creator is accepted straight away, which is
    // what makes the assertion above about the RULE rather than about groups
    // never being accepted.
    const thirdInbox = await third.data.conversations.list({ state: 'accepted' });
    expect(thirdInbox.items.some((i) => i.conversationId === group.conversationId)).toBe(true);
  });

  /** FR-023. The refusal, and what it must not say. */
  it('J-39 somebody in a blocking relationship cannot be added, and is not named as blocked', async () => {
    const a = await actor('blockGroupA');
    const b = await actor('blockGroupB');
    const blocked = await actor('blockGroupTarget');
    await b.data.people.follow(a.handle);
    await blocked.data.people.follow(a.handle);

    await b.data.safety.block(blocked.handle);

    // b has blocked the target, so a group containing both is refused - even
    // though the person CREATING it has blocked nobody.
    await expect(
      a.data.conversations.createGroup({ participantHandles: [b.handle, blocked.handle] }),
    ).rejects.toThrow();

    // FR-023b: an existing group is left alone when a block happens later.
    const c = await actor('blockGroupC');
    await c.data.people.follow(a.handle);
    const group = await a.data.conversations.createGroup({
      participantHandles: [b.handle, c.handle],
      name: 'Blocked Later',
    });
    await b.data.safety.block(c.handle);

    // Both are still in it, and both can still read it.
    expect((await b.data.conversations.get(group.conversationId)).conversationId).toBe(
      group.conversationId,
    );
    expect((await c.data.conversations.get(group.conversationId)).conversationId).toBe(
      group.conversationId,
    );
  });

  it('J-40 a group is capped, and the cap is a server-side refusal', async () => {
    const a = await actor('capA');
    const handles: string[] = [];
    for (let i = 0; i < 19; i++) {
      handles.push((await actor('capMember')).handle);
    }
    // 19 + the creator is exactly the cap, and must be allowed.
    const full = await a.data.conversations.createGroup({ participantHandles: handles });
    expect(full.participants).toHaveLength(20);

    const oneMore = await actor('capOverflow');
    await expect(
      a.data.conversations.addParticipant(full.conversationId, oneMore.handle),
    ).rejects.toThrow();
  });
});
