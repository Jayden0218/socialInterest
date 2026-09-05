/**
 * T010. Unadorned HTTP. Two callers, for two different reasons:
 *
 *  - the walking skeleton, which must not depend on any app code; and
 *  - the negative journeys N-01..N-04, which MUST bypass the app's data layer.
 *    Their whole purpose is to take the path a modified or hostile client would
 *    take (Principle III). A guarantee tested only through the well-behaved
 *    first-party client is not tested at all.
 */
export interface RawResponse {
  status: number;
  body: unknown;
  headers: Headers;
  text: string;
}

export async function raw(
  baseUrl: string,
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<RawResponse> {
  const { token, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (rest.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const res = await fetch(`${baseUrl}${path}`, { ...rest, headers });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text === '' ? null : JSON.parse(text);
  } catch {
    /* non-JSON is legitimate for media reads */
  }
  return { status: res.status, body, headers: res.headers, text };
}
