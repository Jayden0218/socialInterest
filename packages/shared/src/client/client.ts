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
    const url = new URL(this.opts.baseUrl.replace(/\/$/, '') + path);
    for (const [k, v] of Object.entries(init.query ?? {})) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }

    const headers: Record<string, string> = { accept: 'application/json' };
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    if (op.auth) {
      const token = await this.opts.getToken?.();
      if (token) headers['authorization'] = `Bearer ${token}`;
    }

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
