import type { DataClient } from './client';

/**
 * 008/US11 — FINISH IT LATER.
 *
 * A draft holds UPLOAD IDS rather than media rows (research R11), so publishing
 * one is the existing publish call with the same arguments it always took —
 * there is no second way to create a post, and nothing about a draft can drift
 * from what publishing expects.
 */
export interface Draft {
  draftId: string;
  caption?: string;
  interestIds: string[];
  placeId?: string | null;
  uploadIds: string[];
  /** 008/FR-039. Ids whose upload target is gone; named rather than dropped. */
  expiredUploadIds?: string[];
  altTexts?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export class DraftsData {
  constructor(private readonly client: DataClient) {}

  save(input: {
    draftId?: string;
    caption?: string;
    interestIds: string[];
    placeId?: string | null;
    uploadIds: string[];
    altTexts?: Record<string, string>;
  }): Promise<Draft> {
    return this.client.call<Draft>('postMeDrafts', { body: input });
  }

  get(draftId: string): Promise<Draft> {
    return this.client.call<Draft>('getMeDraftsByDraftId', { params: { draftId } });
  }

  list(opts: { limit?: number; cursor?: string } = {}): Promise<{
    items: Draft[];
    page: { nextCursor: string | null; emptyStateHint?: string | null };
  }> {
    return this.client.call('getMeDrafts', { query: { limit: opts.limit, cursor: opts.cursor } });
  }

  discard(draftId: string): Promise<void> {
    return this.client.call<void>('deleteMeDraftsByDraftId', { params: { draftId } });
  }
}
