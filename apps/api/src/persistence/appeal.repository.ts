import { Injectable } from '@nestjs/common';
import { BaseRepository, type Page } from './base.repository';
import { keys } from './keys';

export type AppealSubjectKind = 'post' | 'comment' | 'message' | 'review';
export type AppealState = 'open' | 'upheld' | 'rejected';

export interface AppealItem {
  appealId: string;
  subjectKind: AppealSubjectKind;
  subjectId: string;
  /** The person whose content was removed. The ONLY non-moderator who may read it. */
  authorId: string;
  body: string;
  state: AppealState;
  createdAt: string;
  decidedAt?: string;
  moderatorId?: string;
  outcome?: string;
}

/**
 * A53, A54 — 008/FR-047, FR-048.
 *
 * KEYED EXACTLY LIKE A REPORT, and that is a decision rather than laziness. An
 * appeal is a queue item with a state that moves, oldest first, read by
 * moderators — which is what `ReportRepository` already is. A second scheme for
 * the same shape would be a second set of ordering bugs to find.
 *
 * PRIVATE BY KEY, in the same sense mutes and drafts are: the appeal lives under
 * `APPEAL#<id>` with an author pointer in the author's own partition, and no
 * index exists that would let one person enumerate another's. The authorisation
 * check in the service is the second lock, not the only one — 008/FR-048 and
 * SC-015 are tested by driving the request DIRECTLY with somebody else's id.
 */
@Injectable()
export class AppealRepository extends BaseRepository {
  async create(appeal: AppealItem): Promise<void> {
    await this.putItem({
      ...keys.appeal(appeal.appealId),
      ...keys.appealByState(appeal.state, appeal.createdAt),
      type: 'Appeal',
      ...appeal,
    });
    /**
     * The pointer row, written SECOND. If it fails the appeal still exists and
     * a moderator still sees it in the queue — the appeal is not lost, only the
     * author's own list is short. The reverse order would leave a pointer to
     * nothing, which is a list that 404s on a row it just showed.
     */
    await this.putItem({
      ...keys.appealByAuthor(appeal.authorId, appeal.createdAt, appeal.appealId),
      type: 'AppealPointer',
      appealId: appeal.appealId,
      authorId: appeal.authorId,
      createdAt: appeal.createdAt,
    });
  }

  async findById(appealId: string): Promise<AppealItem | null> {
    return this.getItem<AppealItem>(keys.appeal(appealId));
  }

  /** A53. Oldest first — newest-first quietly starves the oldest appeal. */
  async listByState(
    state: AppealState,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<Page<AppealItem>> {
    return this.query<AppealItem>(`ASTATE#${state}`, {
      indexName: 'gsi1',
      ascending: true,
      limit: opts.limit ?? 25,
      cursor: opts.cursor ?? null,
    });
  }

  /**
   * A54. The author's own appeals, newest first, resolved through the pointer
   * rows. Two reads rather than one, and the alternative is a scan.
   */
  async listByAuthor(
    authorId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<Page<AppealItem>> {
    const page = await this.query<{ appealId: string }>(`USER#${authorId}`, {
      skPrefix: 'APPEALBY#',
      limit: opts.limit ?? 25,
      cursor: opts.cursor ?? null,
    });
    const appeals = await Promise.all(page.items.map((p) => this.findById(p.appealId)));
    return {
      ...page,
      // A pointer whose appeal is gone is dropped rather than rendered as a
      // hole: the list is the author's own and an empty row explains nothing.
      items: appeals.filter((a): a is AppealItem => a !== null),
    };
  }

  async transition(appealId: string, patch: Partial<AppealItem>): Promise<AppealItem> {
    const existing = await this.findById(appealId);
    if (!existing) throw new Error(`appeal ${appealId} not found`);
    const updated = { ...existing, ...patch };
    await this.putItem({
      ...keys.appeal(appealId),
      // The GSI1 key follows the state, so the queue reflects the transition.
      ...keys.appealByState(updated.state, updated.createdAt),
      type: 'Appeal',
      ...updated,
    });
    return updated;
  }
}
