import { loadConfig } from '../../src/config/configuration';
import { MinioObjectStore } from '../../src/adapters/local/minio-object-store';
import { S3ObjectStore } from '../../src/adapters/aws/s3-object-store';
import { LocalIdentityProvider } from '../../src/adapters/local/local-identity-provider';
import { CognitoIdentityProvider } from '../../src/adapters/aws/cognito-identity-provider';
import { InProcessEventBus } from '../../src/adapters/local/in-process-event-bus';
import { MediaConvertMediaProcessor } from '../../src/adapters/aws/mediaconvert-media-processor';
import type { ObjectStore } from '../../src/ports';

/**
 * The contract both adapter sets must satisfy (research D9).
 *
 * Shape conformance is checked for BOTH sets, so the aws adapters cannot drift
 * from the ports while unprovisioned. Behaviour is exercised against the local
 * set only - the aws set is a deferred placeholder that nothing provisions
 * (plan.md Cost Posture), and per constitution principle V a local pass is not
 * evidence the aws path works.
 */
const config = loadConfig();

describe('ObjectStore port — shape conformance (both profiles)', () => {
  const methods: (keyof ObjectStore)[] = [
    'createUploadTarget', 'getObject', 'putObject', 'deleteObject', 'publicUrl',
  ];
  for (const [name, make] of [
    ['MinioObjectStore', () => new MinioObjectStore(config)],
    ['S3ObjectStore', () => new S3ObjectStore(config)],
  ] as const) {
    it(`${name} implements every ObjectStore method`, () => {
      const adapter = make() as unknown as Record<string, unknown>;
      for (const m of methods) expect(typeof adapter[m]).toBe('function');
    });
  }
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

  it('CognitoIdentityProvider conforms to the port and fails loudly when unprovisioned', async () => {
    // Deliberately throws rather than returning null: selecting the aws profile
    // without provisioning must fail visibly, not silently reject every request.
    const idp = new CognitoIdentityProvider();
    expect(typeof idp.verify).toBe('function');
    await expect(idp.verify('x')).rejects.toThrow(/not provisioned/i);
  });
});

describe('MediaProcessor port', () => {
  it('MediaConvert adapter conforms and fails loudly when unprovisioned', async () => {
    const mp = new MediaConvertMediaProcessor();
    for (const m of ['submitVideoJob', 'getJob', 'processImage'] as const) {
      expect(typeof mp[m]).toBe('function');
    }
    await expect(mp.submitVideoJob()).rejects.toThrow(/not provisioned/i);
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
