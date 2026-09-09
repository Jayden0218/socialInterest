/**
 * Polls until a condition holds, or fails at the deadline saying what it saw.
 *
 * Written because four integration cases waited on an ASYNCHRONOUS job with a
 * fixed `setTimeout`. That is a test that passes on timing luck: it was green on
 * a developer machine and went red in CI the moment the API did slightly more
 * work per request. The number was never the problem - waiting for a duration
 * instead of for the condition was.
 *
 * This project has recorded the same shape once already ("an integration test
 * passed on timing luck because its uniqueness suffix was near-duplicate by
 * construction"). A longer sleep would have made it rarer and no less wrong.
 */
export async function eventually<T>(
  read: () => Promise<T>,
  holds: (value: T) => boolean,
  opts: { timeoutMs?: number; intervalMs?: number; describe?: string } = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const intervalMs = opts.intervalMs ?? 50;
  const deadline = Date.now() + timeoutMs;
  let last = await read();
  while (!holds(last)) {
    if (Date.now() > deadline) {
      throw new Error(
        `${opts.describe ?? 'condition'} never held within ${timeoutMs}ms. Last seen: ${JSON.stringify(last)}`,
      );
    }
    await new Promise((r) => setTimeout(r, intervalMs));
    last = await read();
  }
  return last;
}

/**
 * 008/US9. THE NEGATIVE FORM, and it is not `eventually`'s opposite.
 *
 * "Zero notifications" checked ONCE against an asynchronous pipeline passes
 * before anything could have arrived: green, worthless, and indistinguishable
 * from a real pass. `apps/e2e/support/eventually.ts` grew this for the same
 * reason in 004; the integration harness needed it the moment a block had to be
 * proved to have suppressed something.
 */
export async function consistently<T>(
  read: () => Promise<T>,
  holds: (value: T) => boolean,
  opts: { forMs?: number; intervalMs?: number; describe?: string } = {},
): Promise<void> {
  const forMs = opts.forMs ?? 1000;
  const intervalMs = opts.intervalMs ?? 100;
  const deadline = Date.now() + forMs;
  do {
    const value = await read();
    if (!holds(value)) {
      throw new Error(
        `${opts.describe ?? 'condition'} stopped holding within ${forMs}ms. Value: ${JSON.stringify(value)}`,
      );
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  } while (Date.now() < deadline);
}
