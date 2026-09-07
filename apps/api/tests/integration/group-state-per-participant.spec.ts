import request from 'supertest';
import { bootHarness, type Harness } from './harness';

/**
 * 005/R2 BEHAVIOURALLY. FR-021, FR-022, FR-025.
 *
 * The structural guard in `tests/unit/conversation-state-authority.spec.ts` says
 * no read path decides from the meta item's state. It cannot say what happens
 * when one does - and what happened was this: `respondToRequest` called
 * `setState`, which writes the meta item AND EVERY PARTICIPANT ROW. So one
 * invitee tapping Accept on a group invitation accepted it on behalf of everyone
 * who had not looked at it yet, and un-declined it for anyone who had said no.
 *
 * Nothing caught that. Twelve tests exercise the request rules and all of them
 * hold pairs, where the meta item's state and both people's ARE the same fact.
 * The defect is only observable with three people in different states at once,
 * which is exactly what this file constructs.
 *
 * The guard found it; this proves the fix. A structural guard on its own says
 * the dependency is absent, never that the behaviour is right.
 */
describe('005/US3 — a group participant\'s state is their own', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await bootHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  const server = () => h.app.getHttpServer();

  const stateFor = async (userId: string, conversationId: string) => {
    const res = await request(server())
      .get(`/v1/conversations/${conversationId}`)
      .set('authorization', `Bearer ${await h.token(userId)}`);
    return { status: res.status, body: res.body };
  };

  /** Three invitees, none of whom follows the creator, so all three are requested. */
  const inviteThree = async () => {
    const creator = await h.createPerson('grpcreator');
    const alice = await h.createPerson('grpalice');
    const bob = await h.createPerson('grpbob');
    const jo = await h.createPerson('grpjo');

    const handleOf = async (userId: string) => {
      const me = await request(server())
        .get('/v1/me')
        .set('authorization', `Bearer ${await h.token(userId)}`);
      return me.body.handle as string;
    };

    const res = await request(server())
      .post('/v1/conversations/groups')
      .set('authorization', `Bearer ${await h.token(creator)}`)
      .send({
        participantHandles: [await handleOf(alice), await handleOf(bob), await handleOf(jo)],
        name: 'Three States',
      });
    expect(res.status).toBe(201);
    return { creator, alice, bob, jo, conversationId: res.body.conversationId as string };
  };

  it('one person accepting does not accept for anybody else', async () => {
    const { alice, bob, jo, conversationId } = await inviteThree();

    // All three start in Requests - the precondition, asserted rather than
    // assumed, so a failure below cannot be "they were accepted all along".
    for (const person of [alice, bob, jo]) {
      expect((await stateFor(person, conversationId)).body.state).toBe('requested');
    }

    const accepted = await request(server())
      .post(`/v1/conversations/${conversationId}/accept`)
      .set('authorization', `Bearer ${await h.token(alice)}`);
    expect(accepted.status).toBe(204);

    expect((await stateFor(alice, conversationId)).body.state).toBe('accepted');
    // THE ASSERTION THAT WAS FAILING. Both of these read `accepted` before the
    // fix, for a decision neither of them made.
    expect((await stateFor(bob, conversationId)).body.state).toBe('requested');
    expect((await stateFor(jo, conversationId)).body.state).toBe('requested');
  });

  it('a decline is one person leaving it alone, not the group being declined', async () => {
    const { alice, bob, jo, conversationId } = await inviteThree();

    await request(server())
      .post(`/v1/conversations/${conversationId}/decline`)
      .set('authorization', `Bearer ${await h.token(jo)}`)
      .expect(204);
    await request(server())
      .post(`/v1/conversations/${conversationId}/accept`)
      .set('authorization', `Bearer ${await h.token(alice)}`)
      .expect(204);

    // Jo's decline SURVIVES Alice's accept. Before the fix Alice's accept wrote
    // every participant row, so it silently un-declined Jo.
    expect((await stateFor(jo, conversationId)).body.state).toBe('declined');
    expect((await stateFor(alice, conversationId)).body.state).toBe('accepted');
    expect((await stateFor(bob, conversationId)).body.state).toBe('requested');
  });

  /**
   * The reply-accepts rule (004) has the same shape and had the same defect:
   * `view.state === 'requested'` read the meta item, and the write fanned out.
   */
  it('replying accepts for the replier only', async () => {
    const { alice, bob, jo, conversationId } = await inviteThree();

    const sent = await request(server())
      .post(`/v1/conversations/${conversationId}/messages`)
      .set('authorization', `Bearer ${await h.token(bob)}`)
      .send({ body: 'I am in' });
    expect(sent.status).toBe(201);

    expect((await stateFor(bob, conversationId)).body.state).toBe('accepted');
    expect((await stateFor(alice, conversationId)).body.state).toBe('requested');
    expect((await stateFor(jo, conversationId)).body.state).toBe('requested');
  });

  /**
   * And the pair path is unchanged, which is the other half of the fix: the
   * per-participant write must not be applied where the fan-out IS the
   * semantics. A pair accept still moves the conversation, not just a row.
   */
  it('a pair accept still moves the whole conversation (FR-026 unchanged)', async () => {
    const a = await h.createPerson('pairstatea');
    const b = await h.createPerson('pairstateb');
    const bHandle = (
      await request(server()).get('/v1/me').set('authorization', `Bearer ${await h.token(b)}`)
    ).body.handle as string;

    const opened = await request(server())
      .put(`/v1/conversations/with/${bHandle}`)
      .set('authorization', `Bearer ${await h.token(a)}`);
    expect(opened.status).toBe(200);
    const conversationId = opened.body.conversationId as string;
    expect((await stateFor(b, conversationId)).body.state).toBe('requested');

    await request(server())
      .post(`/v1/conversations/${conversationId}/accept`)
      .set('authorization', `Bearer ${await h.token(b)}`)
      .expect(204);

    // BOTH sides, because for a pair that is one fact and not two.
    expect((await stateFor(a, conversationId)).body.state).toBe('accepted');
    expect((await stateFor(b, conversationId)).body.state).toBe('accepted');
  });
});
