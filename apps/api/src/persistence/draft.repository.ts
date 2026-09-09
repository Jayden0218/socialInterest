import { Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { BaseRepository, type Page } from './base.repository';
import { keys, SK_PREFIX } from './keys';

/**
 * 008/US11, FR-037 — AN UNFINISHED POST.
 *
 * A draft holds UPLOAD IDS, not media rows (research R11). That is the decision
 * the whole story rests on: a draft is a PRE-PUBLISH object, so publishing one
 * is the existing publish path with the same arguments it always took, and no
 * second way to create a post exists. Storing media rows would have made a
 * draft a half-built post, and half-built posts are what `processingState` is
 * already for.
 *
 * The consequence is honest and is surfaced rather than hidden: an upload
 * expires, so a draft older than its uploads restores its words and says its
 * pictures are gone (FR-039), instead of appearing to have silently lost them.
 */
export interface DraftItem {
  draftId: string;
  userId: string;
  caption?: string;
  interestIds: string[];
  placeId?: string | null;
  uploadIds: string[];
  altTexts?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class DraftRepository extends BaseRepository {
  async save(input: Omit<DraftItem, 'draftId' | 'createdAt' | 'updatedAt'> & { draftId?: string }): Promise<DraftItem> {
    const now = new Date().toISOString();
    const existing = input.draftId ? await this.find(input.userId, input.draftId) : null;
    const draft: DraftItem = {
      draftId: input.draftId ?? ulid(),
      userId: input.userId,
      ...(input.caption !== undefined ? { caption: input.caption } : {}),
      interestIds: input.interestIds,
      ...(input.placeId !== undefined ? { placeId: input.placeId } : {}),
      uploadIds: input.uploadIds,
      ...(input.altTexts ? { altTexts: input.altTexts } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.putItem({
      ...keys.draft(draft.userId, draft.draftId),
      type: 'Draft',
      ...draft,
    });
    return draft;
  }

  async find(userId: string, draftId: string): Promise<DraftItem | null> {
    return this.getItem<DraftItem>(keys.draft(userId, draftId));
  }

  async list(userId: string, opts: { limit?: number; cursor?: string | null } = {}): Promise<Page<DraftItem>> {
    return this.query<DraftItem>(`USER#${userId}`, {
      skPrefix: SK_PREFIX.draft,
      // Newest first: a list of things you meant to finish is read from the top.
      ascending: false,
      limit: opts.limit ?? 20,
      cursor: opts.cursor ?? null,
    });
  }

  async remove(userId: string, draftId: string): Promise<void> {
    await this.deleteItem(keys.draft(userId, draftId));
  }
}
