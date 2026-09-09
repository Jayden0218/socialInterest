import { Inject, Injectable } from '@nestjs/common';
import { PostTermIndexRepository, type PostTermIndexItem } from '../../persistence/post-term-index.repository';
import { PostQueryService } from '../posts/post-query.service';
import { VisibilityFilter, type Viewer } from '../../visibility/visibility.filter';
import { queryTerms } from './tokeniser';

/**
 * 008/US6 — FIND A POST, NOT JUST AN INTEREST (FR-020).
 *
 * Candidates from the term index (A46), intersected across the query's terms,
 * ordered by recency, and then — always — through `VisibilityFilter`.
 *
 * **The index selects; the boundary decides.** SC-009's second half ("unfindable
 * by viewers who may not see it") is delivered by the filter, never by the
 * index, which is why the term row's denormalised `visibility` is a shortcut for
 * the filter rather than a substitute for it.
 *
 * WHAT THIS DELIBERATELY DOES NOT IMPORT: `SignalService`, `RankingService`,
 * `CandidateSource`. FR-021 says a search records no behavioural ranking signal,
 * and `tests/unit/search-records-no-signals.spec.ts` fails the build on the
 * import — sharing its check with the Following feed's, because FR-009 and
 * FR-021 are one requirement on two surfaces.
 *
 * WHY NOT OPENSEARCH. 001/D3 named it as the replacement for the in-memory
 * catalogue cache "when post-content search arrives", and this is that moment. A
 * managed service is billable and needs specific owner approval, which has not
 * been sought. Recorded in the divergence register as a deliberate
 * non-adoption rather than an oversight.
 */
@Injectable()
export class PostSearchService {
  /** Per-term overfetch. The intersection and the filter both shrink this. */
  private static readonly PER_TERM = 60;

  constructor(
    @Inject(PostTermIndexRepository) private readonly terms: PostTermIndexRepository,
    @Inject(PostQueryService) private readonly postQueries: PostQueryService,
    @Inject(VisibilityFilter) private readonly visibility: VisibilityFilter,
  ) {}

  async search(
    viewer: Viewer,
    query: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<{ items: Record<string, unknown>[]; nextCursor: string | null; terms: string[] }> {
    const limit = opts.limit ?? 20;
    const terms = queryTerms(query);
    if (terms.length === 0) return { items: [], nextCursor: null, terms };

    const perTerm = await Promise.all(
      terms.map((t) =>
        this.terms.listByTerm(t, { limit: PostSearchService.PER_TERM }).then((p) => p.items),
      ),
    );

    /**
     * INTERSECTED, not unioned. "rock climbing" means both words, which is what
     * somebody typing two words expects; a union would rank a post containing
     * only "rock" alongside one containing both and call it a match.
     */
    const [first = [], ...rest] = perTerm;
    const byPostId = new Map<string, PostTermIndexItem>(first.map((r) => [r.postId, r]));
    for (const rows of rest) {
      const present = new Set(rows.map((r) => r.postId));
      for (const id of [...byPostId.keys()]) if (!present.has(id)) byPostId.delete(id);
    }

    const before = opts.cursor ?? null;
    const candidates = [...byPostId.values()]
      .filter((r) => (before ? r.createdAt < before : true))
      // Recency only. No relevance ranking - stated in research R6 rather than
      // implied, and a term index carries nothing that would support one.
      .sort((a, b) => (b.createdAt === a.createdAt
        ? b.postId.localeCompare(a.postId)
        : b.createdAt.localeCompare(a.createdAt)));

    /**
     * OVERFETCH, FILTER, THEN CUT — the same order as the Following feed and for
     * the same reason: the boundary can remove any of these, so cutting first
     * returns short pages whenever a match is one the viewer may not see.
     */
    const cache = this.visibility.newRequestCache();
    const visible = await this.visibility.filter(viewer, candidates.slice(0, limit * 2 + 1), cache);
    const pageRows = visible.slice(0, limit);

    const items = (
      await Promise.all(pageRows.map((row) => this.postQueries.responseFor(row.postId)))
    ).filter((p): p is Record<string, unknown> => p !== null);

    const last = pageRows[pageRows.length - 1];
    const more = visible.length > limit;
    return { items, nextCursor: more && last ? last.createdAt : null, terms };
  }
}
