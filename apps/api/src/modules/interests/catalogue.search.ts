import { Inject, Injectable } from '@nestjs/common';
import {
  CATALOGUE_SEARCH,
  normaliseName,
  similarity,
  type CatalogueMatch,
  type CatalogueSearch,
} from './catalogue.cache';
import type { InterestItem } from '../../persistence/interest.repository';

export interface SearchResult {
  interest: InterestItem;
  parent: InterestItem | null;
  similarity: number;
}

/**
 * FR-026 type-ahead and FR-023 near-duplicate detection, over the in-memory
 * catalogue (research D3).
 *
 * DynamoDB does prefix via begins_with but not fuzzy or mid-string matching,
 * which both requirements need. The catalogue is small and slow-changing, so it
 * is matched in memory instead of behind a search cluster. This class is the
 * seam OpenSearch replaces when post-content search arrives - callers depend on
 * it, not on the cache.
 */
@Injectable()
export class InterestSearch {
  constructor(@Inject(CATALOGUE_SEARCH) private readonly catalogue: CatalogueSearch) {}

  /**
   * FR-026: results appear as the person types, and every sub-interest carries
   * its parent so "portraits" under Photography is distinguishable from
   * "portraits" under Painting.
   */
  search(
    query: string,
    opts: { level?: 'top' | 'sub'; parentId?: string; limit?: number } = {},
  ): SearchResult[] {
    return this.catalogue.search(query, opts).map((m) => this.withParent(m));
  }

  /** Browsing with no query: the curated top level, or one parent's children. */
  browse(opts: { level?: 'top' | 'sub'; parentId?: string; limit?: number } = {}): SearchResult[] {
    // 013. Flat: there is no hierarchy to walk and no 'ROOT' to stand in for one.
    return this.catalogue
      .active()
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, opts.limit ?? 50)
      .map((interest) => this.withParent({ interest, similarity: 1 }));
  }

  /**
   * 013/FR-008. ACROSS THE WHOLE CATALOGUE.
   *
   * It was scoped to one parent because "portraits" could legitimately exist
   * under two. Flat, there is no second place for a name to live, so a global
   * check blocks nothing valid — and scoping it to a parent that no longer
   * exists is how the gate would have stopped having an opinion at all.
   */
  findSimilar(name: string, limit = 5): SearchResult[] {
    return this.catalogue.findSimilar(name, limit).map((m) => this.withParent(m));
  }

  /**
   * 013/FR-008. An exact normalised-name collision ANYWHERE.
   *
   * Was scoped to one parent. This is the branch that makes "Bouldering" and
   * "bouldering" one interest that was never duplicated — contract §1 row 3 —
   * so scoping it to a parent that no longer exists would have quietly turned
   * every repeat into a new interest.
   */
  findExact(name: string): InterestItem | null {
    return this.catalogue.findExactByName(name) ?? null;
  }

  /**
   * Similarity at or above which the API refuses rather than merely warns.
   *
   * Calibrated against measured scores, not guessed. Normalised Levenshtein on a
   * single-character typo scales with word length:
   *
   *   bouldering / boldering          0.900   <- must block
   *   sourdough  / sourdaugh          0.889   <- must block
   *   portrait   / portraits          0.889   <- must block (plural duplicate)
   *   film photography / street photography  0.667  <- must NOT block
   *   bouldering / birdwatching       0.333   <- must NOT block
   *
   * 0.9 was the first choice and let `sourdaugh` through, which is precisely the
   * case the requirement exists for. 0.85 catches single-character typos down to
   * roughly seven-letter names while leaving genuinely distinct interests - which
   * cluster at 0.67 and below - untouched. Blocking those would be the worse
   * failure: people stop creating interests at all.
   *
   * The gap between this and the 0.75 warn threshold in findSimilar is
   * deliberate: 0.75-0.85 shows candidates, above 0.85 refuses.
   */
  static readonly BLOCKING_SIMILARITY = 0.85;

  isTooSimilar(candidates: SearchResult[]): boolean {
    return candidates.some((c) => c.similarity >= InterestSearch.BLOCKING_SIMILARITY);
  }

  scoreAgainst(name: string, other: string): number {
    return similarity(normaliseName(name), normaliseName(other));
  }

  /**
   * 013. Interests are flat, so a result has no parent to resolve. Kept as a
   * mapper rather than inlined, because every caller shapes a `SearchResult`
   * and one place to change beats six.
   */
  private withParent(match: CatalogueMatch): SearchResult {
    return { interest: match.interest, parent: null, similarity: match.similarity };
  }
}
