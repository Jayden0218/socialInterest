import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InterestRepository, type InterestItem } from '../../persistence/interest.repository';

export interface CatalogueMatch {
  interest: InterestItem;
  similarity: number;
}

/**
 * The seam OpenSearch replaces later (research D3).
 *
 * DynamoDB can do prefix matching but not fuzzy or mid-string matching, which
 * FR-023 (near-duplicate detection) and FR-026 (type-ahead) both need. The
 * catalogue is small and slow-changing - hundreds of top-level interests and
 * thousands of sub-interests - so it is held in memory and matched here.
 *
 * Everything else depends on this interface, not on the implementation, so
 * swapping in OpenSearch when post-content search arrives touches no callers.
 */
export interface CatalogueSearch {
  search(query: string, opts?: { level?: 'top' | 'sub'; parentId?: string; limit?: number }): CatalogueMatch[];
  findSimilar(name: string, limit?: number): CatalogueMatch[];
  findExactByName(name: string): InterestItem | undefined | null;
  byId(interestId: string): InterestItem | undefined;
  /**
   * 007/R1: every active interest id, for the ranked feed's candidate source.
   *
   * The catalogue is already fully in memory - `size()` walks it - so this
   * costs nothing new. Exposing it is what lets exploration (FR-007) sample
   * interests the viewer has never engaged with, which is the mechanism that
   * stops a ranked feed collapsing to one subject.
   */
  allIds(): string[];
  /** 013. Every live interest, flat. Was `childrenOf(parentId)`. */
  active(): InterestItem[];
  size(): number;
}

export const CATALOGUE_SEARCH = Symbol('CatalogueSearch');

// 013. Moved to a leaf module to break a cycle; re-exported so the ~dozen
// existing importers are untouched. See ./normalise-name.ts for why.
export { normaliseName } from './normalise-name';
import { normaliseName } from './normalise-name';

/** Normalised Levenshtein similarity in [0,1]. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]!;
  }
  return 1 - prev[b.length]! / Math.max(a.length, b.length);
}

@Injectable()
export class InMemoryCatalogueCache implements CatalogueSearch, OnModuleInit {
  private readonly logger = new Logger(InMemoryCatalogueCache.name);
  private byIdMap = new Map<string, InterestItem>();
  /** 013. Every ACTIVE interest, flat. Replaces the parent-keyed buckets. */
  private flatActive: InterestItem[] = [];

  constructor(@Inject(InterestRepository) private readonly repo: InterestRepository) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  /** Called at startup and, in later phases, from DynamoDB Streams. */
  async refresh(): Promise<void> {
    const all = await this.repo.loadAll();
    const byId = new Map<string, InterestItem>();
    const flat: InterestItem[] = [];
    for (const item of all) {
      // Merged and retired interests STAY in byId: FR-030 requires a merged
      // interest to redirect to its survivor, and a redirect cannot resolve an
      // interest the cache has forgotten. Existing links would 404 instead.
      byId.set(item.interestId, item);

      // ...but they are excluded from search, so they never appear as somewhere
      // to browse, follow, or post to.
      if (item.state !== 'active') continue;
      // 013. One flat list. `byParent` is gone with the hierarchy, and with it
      // the 'ROOT' bucket that made a sibling-scoped lookup work by accident.
      flat.push(item);
    }
    this.byIdMap = byId;
    this.flatActive = flat;
    this.logger.log(`catalogue loaded: ${this.size()} active interests (${byId.size} total)`);
  }

  byId(interestId: string): InterestItem | undefined {
    return this.byIdMap.get(interestId);
  }

  /** 013. Every live interest, flat. Was `childrenOf(parentId)`. */
  active(): InterestItem[] {
    return this.flatActive;
  }

  allIds(): string[] {
    const out: string[] = [];
    for (const [id, i] of this.byIdMap) if (i.state === 'active') out.push(id);
    return out;
  }

  /** Active interests only - what /health reports and what can be posted to. */
  size(): number {
    let n = 0;
    for (const i of this.byIdMap.values()) if (i.state === 'active') n++;
    return n;
  }

  /** FR-026: prefix matches rank above fuzzy ones so type-ahead feels direct. */
  search(
    query: string,
    opts: { level?: 'top' | 'sub'; parentId?: string; limit?: number } = {},
  ): CatalogueMatch[] {
    const q = normaliseName(query);
    if (!q) return [];
    const out: CatalogueMatch[] = [];
    for (const interest of this.byIdMap.values()) {
      // Search never surfaces a merged or retired interest.
      if (interest.state !== 'active') continue;
      const name = interest.nameNormalised;
      const score = name.startsWith(q) ? 1 : name.includes(q) ? 0.9 : similarity(q, name);
      if (score >= 0.6) out.push({ interest, similarity: score });
    }
    return out
      .sort((a, b) => b.similarity - a.similarity || a.interest.name.localeCompare(b.interest.name))
      .slice(0, opts.limit ?? 20);
  }

  /**
   * 013/FR-008. NEAR-DUPLICATES, ACROSS THE WHOLE CATALOGUE.
   *
   * It was scoped to one parent — "portraits" could legitimately exist under
   * two — and with flat interests that scoping has nothing to mean.
   *
   * THE FAILURE MODE IS WORTH STATING PRECISELY, because the first version of
   * this note overstated it. `refresh()` files a parentless item under a
   * `'ROOT'` bucket, so a sibling-scoped lookup does NOT return empty
   * unconditionally — it returns everything if the caller passes `'ROOT'`, and
   * nothing if the caller passes a parent id that no longer exists. The old
   * caller passed `parent.interestId`. So the gate would have failed OPEN, but
   * by way of a stale argument rather than by construction, and a magic
   * `'ROOT'` string working by luck is not a constraint either.
   *
   * Either way nothing errors and no test goes red: the gate simply stops
   * having an opinion. That is the "guard can lose its subject and pass" shape,
   * and it is why `interest-similarity-is-global.spec.ts` was written first.
   */
  findSimilar(name: string, limit = 5): CatalogueMatch[] {
    const q = normaliseName(name);
    const out: CatalogueMatch[] = [];
    for (const interest of this.byIdMap.values()) {
      if (interest.state !== 'active') continue;
      const score = similarity(q, interest.nameNormalised);
      if (score >= 0.75) out.push({ interest, similarity: score });
    }
    return out.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  }

  /** 013/FR-008. An exact normalised-name collision anywhere in the catalogue. */
  findExactByName(name: string): InterestItem | null {
    const q = normaliseName(name);
    for (const interest of this.byIdMap.values()) {
      if (interest.state === 'active' && interest.nameNormalised === q) return interest;
    }
    return null;
  }
}
