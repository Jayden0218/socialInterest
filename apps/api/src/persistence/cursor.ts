/**
 * Opaque cursor over a DynamoDB LastEvaluatedKey. FR-035: paging preserves
 * position, so offsets are deliberately not supported - an offset shifts when
 * items are inserted mid-scroll, which is exactly the bug the requirement names.
 */
export type ExclusiveStartKey = Record<string, unknown>;

export function encodeCursor(key: ExclusiveStartKey | undefined): string | null {
  if (!key) return null;
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined | null): ExclusiveStartKey | undefined {
  if (!cursor) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    return parsed as ExclusiveStartKey;
  } catch {
    // A malformed cursor pages from the start rather than failing the request.
    return undefined;
  }
}
