import { loadConfig } from '../../src/config/configuration';
import { MinioObjectStore } from '../../src/adapters/local/minio-object-store';
import { LocalIdentityProvider } from '../../src/adapters/local/local-identity-provider';
import { InProcessEventBus } from '../../src/adapters/local/in-process-event-bus';
import type { ObjectStore } from '../../src/ports';

/**
 * Port conformance.
 *
 * There was a second, `aws` implementation of each of these, and this file used
 * to assert its shape while noting that shape is not evidence the path works.
 * Those adapters were removed in spec 002 - AWS is not the deployment target and
 * none of them had ever been executed. Only the shipped implementations are
 * checked here now.
 */
const config = loadConfig();

describe('ObjectStore port — shape conformance', () => {
  const methods: (keyof ObjectStore)[] = [
    'createUploadTarget', 'getObject', 'putObject', 'deleteObject', 'publicUrl',
  ];
  it('MinioObjectStore implements every ObjectStore method', () => {
    const adapter = new MinioObjectStore(config) as unknown as Record<string, unknown>;
    for (const m of methods) expect(typeof adapter[m]).toBe('function');
  });
});

describe('ObjectStore port — behaviour (local profile only)', () => {
  const store = new MinioObjectStore(config);

  it('round-trips an object', async () => {
    const key = `contract/${Date.now()}.txt`;
    await store.putObject(key, Buffer.from('hello'), 'text/plain');
    expect((await store.getObject(key)).toString()).toBe('hello');
    await store.deleteObject(key);
  });

  it('issues a presigned upload target that actually accepts bytes (FR-004)', async () => {
    const key = `contract/${Date.now()}-presigned.bin`;
    const target = await store.createUploadTarget({ key, contentType: 'application/octet-stream' });
    expect(target.method).toBe('PUT');
    expect(new Date(target.expiresAt).getTime()).toBeGreaterThan(Date.now());
    const res = await fetch(target.url, { method: 'PUT', body: Buffer.from('presigned') });
    expect(res.ok).toBe(true);
    expect((await store.getObject(key)).toString()).toBe('presigned');
    await store.deleteObject(key);
  });
});

describe('IdentityProvider port', () => {
  it('LocalIdentityProvider round-trips a token and rejects a bad one', async () => {
    const idp = new LocalIdentityProvider(config);
    const token = await idp.issueForTesting('user-1', { isOperator: true });
    expect(await idp.verify(token)).toEqual({ userId: 'user-1', isOperator: true });
    expect(await idp.verify('not-a-token')).toBeNull();
  });


});


describe('EventBus port', () => {
  it('delivers the event to every subscriber for its type, and only those', async () => {
    const bus = new InProcessEventBus();
    const seen: string[] = [];
    bus.subscribe('post.published', (e) => { seen.push(`a:${e.type}`); });
    bus.subscribe('post.published', (e) => { seen.push(`b:${e.type}`); });
    bus.subscribe('other.event', () => { seen.push('should-not-run'); });
    await bus.publish({ type: 'post.published', payload: { postId: 'p1' } });
    await new Promise((r) => setImmediate(r));
    expect(seen.sort()).toEqual(['a:post.published', 'b:post.published']);
  });

  it('stamps occurredAt on delivery', async () => {
    const bus = new InProcessEventBus();
    let occurredAt: string | undefined;
    bus.subscribe('t', (e) => { occurredAt = e.occurredAt; });
    await bus.publish({ type: 't', payload: {} });
    await new Promise((r) => setImmediate(r));
    expect(Number.isNaN(Date.parse(occurredAt ?? ''))).toBe(false);
  });

  it('a handler that throws SYNCHRONOUSLY does not escape', async () => {
    // Regression: `Promise.resolve(handler(e)).catch(...)` cannot catch this -
    // the throw happens while evaluating the argument, before a promise exists.
    const bus = new InProcessEventBus();
    bus.subscribe('x', () => { throw new Error('sync boom'); });
    await expect(bus.publish({ type: 'x', payload: {} })).resolves.toBeUndefined();
    await new Promise((r) => setImmediate(r));
  });

  it('a handler that rejects ASYNCHRONOUSLY does not escape', async () => {
    const bus = new InProcessEventBus();
    bus.subscribe('y', async () => { await Promise.reject(new Error('async boom')); });
    await expect(bus.publish({ type: 'y', payload: {} })).resolves.toBeUndefined();
    await new Promise((r) => setImmediate(r));
  });

  it('one failing handler does not stop the others', async () => {
    const bus = new InProcessEventBus();
    const seen: string[] = [];
    bus.subscribe('z', () => { throw new Error('boom'); });
    bus.subscribe('z', () => { seen.push('survivor'); });
    await bus.publish({ type: 'z', payload: {} });
    await new Promise((r) => setImmediate(r));
    expect(seen).toEqual(['survivor']);
  });
});
