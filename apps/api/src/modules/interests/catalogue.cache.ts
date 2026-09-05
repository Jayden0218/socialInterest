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
  findSimilar(name: string, parentId: string, limit?: number): CatalogueMatch[];
  byId(interestId: string): InterestItem | undefined;
  childrenOf(parentId: string): InterestItem[];
  size(): number;
}

export const CATALOGUE_SEARCH = Symbol('CatalogueSearch');

export const normaliseName = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

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
  private byParent = new Map<string, InterestItem[]>();

  constructor(@Inject(InterestRepository) private readonly repo: InterestRepository) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  /** Called at startup and, in later phases, from DynamoDB Streams. */
  async refresh(): Promise<void> {
    const all = await this.repo.loadAll();
    const byId = new Map<string, InterestItem>();
    const byParent = new Map<string, InterestItem[]>();
    for (const item of all) {
      // Merged and retired interests STAY in byId: FR-030 requires a merged
      // interest to redirect to its survivor, and a redirect cannot resolve an
      // interest the cache has forgotten. Existing links would 404 instead.
      byId.set(item.interestId, item);

      // ...but they are excluded from the hierarchy and from search, so they
      // never appear as somewhere to browse, follow, or post to.
      if (item.state !== 'active') continue;
      const parent = item.parentId ?? 'ROOT';
      byParent.set(parent, [...(byParent.get(parent) ?? []), item]);
    }
    this.byIdMap = byId;
    this.byParent = byParent;
    this.logger.log(`catalogue loaded: ${this.size()} active interests (${byId.size} total)`);
  }

  byId(interestId: string): InterestItem | undefined {
    return this.byIdMap.get(interestId);
  }

  childrenOf(parentId: string): InterestItem[] {
    return this.byParent.get(parentId) ?? [];
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
      if (opts.level && interest.level !== opts.level) continue;
      if (opts.parentId && interest.parentId !== opts.parentId) continue;
      const name = interest.nameNormalised;
      const score = name.startsWith(q) ? 1 : name.includes(q) ? 0.9 : similarity(q, name);
      if (score >= 0.6) out.push({ interest, similarity: score });
    }
    return out
      .sort((a, b) => b.similarity - a.similarity || a.interest.name.localeCompare(b.interest.name))
      .slice(0, opts.limit ?? 20);
  }

  /** FR-023: near-duplicates, scoped to one parent - "portraits" may exist under two. */
  findSimilar(name: string, parentId: string, limit = 5): CatalogueMatch[] {
    const q = normaliseName(name);
    return (this.byParent.get(parentId) ?? [])
      .map((interest) => ({ interest, similarity: similarity(q, interest.nameNormalised) }))
      .filter((m) => m.similarity >= 0.75)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }
}
