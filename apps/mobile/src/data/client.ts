import { ApiClient } from '@sih/shared';
import type { OperationName } from '@sih/shared';
import { toDataError } from './errors';

/**
 * The app's single API entry point (002/T018).
 *
 * Deliberately free of react-native imports so the end-to-end suite can drive
 * this exact code in Node. Anything platform-specific - token storage, for
 * instance - is injected, not imported. If this file ever imports from
 * react-native, apps/e2e can no longer exercise the app's real request path and
 * the suite silently goes back to testing the generated client.
 */
export interface TokenStore {
  get(): string | null | Promise<string | null>;
  set(token: string | null): void | Promise<void>;
}

/** Default store: in-memory. The app supplies a persistent one. */
export class MemoryTokenStore implements TokenStore {
  private token: string | null = null;
  get(): string | null {
    return this.token;
  }
  set(token: string | null): void {
    this.token = token;
  }
}

export interface DataClientOptions {
  /**
   * Where the API lives — a fixed address, or a function resolved per request.
   *
   * 009/US1 made the address something a person can change while the app is
   * running. Passing a FUNCTION here mirrors what `getToken` has always done,
   * and it matters for a reason that is not style: `ApiClient` reads
   * `opts.baseUrl` when it builds each request, so a live getter means changing
   * the address takes effect on the next call with nothing rebuilt.
   *
   * Rebuilding the data layer instead would replace `AppData` mid-flight, and
   * the sign-in that follows an address change would run against the object it
   * just replaced — signing in to the old backend, or to nothing.
   */
  baseUrl: string | (() => string);
  tokens?: TokenStore;
  fetch?: typeof globalThis.fetch;
}

export class DataClient {
  readonly tokens: TokenStore;
  private readonly api: ApiClient;

  constructor(opts: DataClientOptions) {
    this.tokens = opts.tokens ?? new MemoryTokenStore();
    const resolve = typeof opts.baseUrl === 'function' ? opts.baseUrl : () => opts.baseUrl as string;
    this.api = new ApiClient({
      // A getter, not a value: read afresh for every request, the same way the
      // token is. Nothing in `@sih/shared` changes for this.
      get baseUrl() {
        return resolve();
      },
      getToken: () => this.tokens.get(),
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
    });
  }

  async call<T>(
    name: OperationName,
    init: { params?: Record<string, string>; query?: Record<string, unknown>; body?: unknown } = {},
  ): Promise<T> {
    try {
      return await this.api.call<T>(name, init);
    } catch (err) {
      throw toDataError(err);
    }
  }
}
