import request from 'supertest';
import { bootHarness, type Harness } from './harness';

/**
 * 001/FR-046 and 004/FR-008. Every new write path is rate-limited.
 *
 * The requirement is about flooding, and it is the kind that gets added to the
 * endpoints somebody remembered. This enumerates the writes 004 introduced and
 * asserts each one actually throttles - a decorator that was forgotten looks
 * exactly like one that is there until somebody sends the tenth request.
 */
describe('rate limits on the writes 004 introduced (FR-046, FR-008)', () => {
  let h: Harness;
  let token: string;
  beforeAll(async () => {
    h = await bootHarness();
    token = await h.token(await h.createPerson('limiter'));
  }, 120_000);
  afterAll(async () => h?.close());

  /**
   * Sends until it is refused, or gives up. `attempts` is deliberately well
   * above the configured capacity of any of these, so a limit that exists is
   * always reached.
   */
  const untilThrottled = async (
    send: () => request.Test,
    attempts = 60,
  ): Promise<{ throttled: boolean; after: number }> => {
    for (let i = 1; i <= attempts; i++) {
      const res = await send();
      if (res.status === 429) return { throttled: true, after: i };
    }
    return { throttled: false, after: attempts };
  };

  it('place creation is limited', async () => {
    const result = await untilThrottled(() =>
      request(h.app.getHttpServer())
        .post('/v1/places')
        .set('authorization', `Bearer ${token}`)
        .send({ name: `Spam ${Math.random()}`, category: 'other', locality: 'Nowhere' }),
    );
    expect(result).toEqual({ throttled: true, after: expect.any(Number) });
  }, 120_000);

  it('opening conversations is limited', async () => {
    // Every call names a different handle, so this is the "open a thread with
    // everybody" flood rather than a repeat of one request.
    const result = await untilThrottled(() =>
      request(h.app.getHttpServer())
        .put(`/v1/conversations/with/nobody${Math.random().toString(36).slice(2, 8)}`)
        .set('authorization', `Bearer ${token}`),
    );
    expect(result).toEqual({ throttled: true, after: expect.any(Number) });
  }, 120_000);

  it('publishing is limited (001/FR-046, still)', async () => {
    const result = await untilThrottled(() =>
      request(h.app.getHttpServer())
        .post('/v1/posts')
        .set('authorization', `Bearer ${token}`)
        .send({ uploadIds: ['nope'], interestIds: ['nope'] }),
    );
    expect(result).toEqual({ throttled: true, after: expect.any(Number) });
  }, 120_000);
});
