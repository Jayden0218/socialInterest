/**
 * Event delivery in this product is asynchronous ON PURPOSE - a slow handler
 * must never block the request that produced the event. So an assertion about a
 * notification, or about anything an event handler writes, has to allow for it.
 *
 * Two helpers, and the second matters more than the first.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Polls until the predicate holds, or fails at the deadline with the last value
 * seen - which is what makes a failure diagnosable rather than just late.
 */
export async function eventually<T>(
  read: () => Promise<T>,
  holds: (value: T) => boolean,
  opts: { timeoutMs?: number; intervalMs?: number; describe?: string } = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const intervalMs = opts.intervalMs ?? 50;
  const deadline = Date.now() + timeoutMs;
  let last: T = await read();
  while (!holds(last)) {
    if (Date.now() > deadline) {
      throw new Error(
        `${opts.describe ?? 'condition'} never held within ${timeoutMs}ms. ` +
          `Last value: ${JSON.stringify(last)}`,
      );
    }
    await sleep(intervalMs);
    last = await read();
  }
  return last;
}

/**
 * Asserts something STAYS true for a window.
 *
 * This is the one that matters. A negative assertion against an asynchronous
 * pipeline - "zero notifications were created" - passes trivially if you check
 * before anything could have arrived. It is green, it is worthless, and it is
 * indistinguishable from a real pass. SC-003 and SC-006 are both of this shape.
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
        `${opts.describe ?? 'condition'} stopped holding within ${forMs}ms. ` +
          `Value: ${JSON.stringify(value)}`,
      );
    }
    await sleep(intervalMs);
  } while (Date.now() < deadline);
}
