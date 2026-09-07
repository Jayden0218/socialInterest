import { operations, type OperationName } from './operations.generated';

export interface ApiClientOptions {
  baseUrl: string;
  /** Returns the current access token, or null when signed out. */
  getToken?: () => string | null | Promise<string | null>;
  fetch?: typeof globalThis.fetch;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: unknown,
  ) {
    super(`API error ${status}`);
  }
}

/**
 * Thin typed client over the generated operation map. Both the mobile app and the
 * contract tests use it, so a contract change breaks the build rather than a user.
 */
export class ApiClient {
  constructor(private readonly opts: ApiClientOptions) {}

  async call<T>(
    name: OperationName,
    init: { params?: Record<string, string>; query?: Record<string, unknown>; body?: unknown } = {},
  ): Promise<T> {
    const op = operations[name];
    let path: string = op.path;
    for (const [k, v] of Object.entries(init.params ?? {})) {
      path = path.replace(`{${k}}`, encodeURIComponent(v));
    }
    /**
     * A relative base such as `/v1` is resolved against the page origin. The
     * client used to require an absolute base, so any browser deployment - or a
     * same-origin proxy, which is how the browser journeys avoid needing CORS on
     * the API - threw "Failed to construct 'URL'" before a request was ever made.
     */
    const base = this.opts.baseUrl.replace(/\/$/, '');
    const origin = (globalThis as { location?: { origin?: string } }).location?.origin;
    const absolute = /^[a-z][a-z0-9+.-]*:/i.test(base);
    if (!absolute && origin === undefined) {
      throw new Error(
        `baseUrl "${this.opts.baseUrl}" is relative and there is no page origin to resolve it against. ` +
          'Pass an absolute base URL outside a browser.',
      );
    }
    const url = absolute ? new URL(base + path) : new URL(base + path, origin);
    for (const [k, v] of Object.entries(init.query ?? {})) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }

    const headers: Record<string, string> = { accept: 'application/json' };
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    /**
     * Send the token whenever we have one, not only where `auth` is true.
     *
     * `auth` means the endpoint REQUIRES a caller; several endpoints are readable
     * signed out but answer differently when they know who is asking - a share
     * link to a followers-only post, an interest space containing one, or an
     * author's own post that is still processing. Gating the header on `auth`
     * made a signed-in person anonymous on exactly those reads, so they were told
     * "not available to you" about their own post. Found by the first end-to-end
     * journey; no unit test could see it, because both sides of the contract
     * agreed and neither sent a request.
     */
    const token = await this.opts.getToken?.();
    if (token) headers['authorization'] = `Bearer ${token}`;

    const doFetch = this.opts.fetch ?? globalThis.fetch;
    const res = await doFetch(url.toString(), {
      method: op.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const parsed: unknown = text ? JSON.parse(text) : undefined;
    if (!res.ok) throw new ApiError(res.status, parsed);
    return parsed as T;
  }
}
