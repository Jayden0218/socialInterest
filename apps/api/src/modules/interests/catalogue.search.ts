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
    const items = opts.parentId
      ? this.catalogue.childrenOf(opts.parentId)
      : this.catalogue.childrenOf('ROOT');
    return items
      .filter((i) => (opts.level ? i.level === opts.level : true))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, opts.limit ?? 50)
      .map((interest) => this.withParent({ interest, similarity: 1 }));
  }

  /**
   * FR-023. Scoped to one parent on purpose: the same name under two different
   * parents is legitimate (spec.md edge case), so a global duplicate check would
   * block valid interests.
   */
  findSimilar(name: string, parentId: string, limit = 5): SearchResult[] {
    return this.catalogue.findSimilar(name, parentId, limit).map((m) => this.withParent(m));
  }

  /** An exact normalised-name collision under the same parent, if one exists. */
  findExact(name: string, parentId: string): InterestItem | null {
    const target = normaliseName(name);
    return this.catalogue.childrenOf(parentId).find((i) => i.nameNormalised === target) ?? null;
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

  private withParent(match: CatalogueMatch): SearchResult {
    const parent = match.interest.parentId ? this.catalogue.byId(match.interest.parentId) : undefined;
    return { interest: match.interest, parent: parent ?? null, similarity: match.similarity };
  }
}
