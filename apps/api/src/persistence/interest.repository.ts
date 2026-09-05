import { Injectable } from '@nestjs/common';
import { BaseRepository, type Page } from './base.repository';
import { keys } from './keys';

export interface InterestItem {
  interestId: string;
  name: string;
  nameNormalised: string;
  slug: string;
  level: 'top' | 'sub';
  parentId?: string;
  createdBy: string;
  description?: string;
  postCount: number;
  followerCount: number;
  state: 'active' | 'merging' | 'merged' | 'retired';
  mergedIntoId?: string;
  createdAt: string;
}

/** Access patterns A12 (by id/slug), A13 (children), A14 (whole catalogue). */
@Injectable()
export class InterestRepository extends BaseRepository {
  async findById(interestId: string): Promise<InterestItem | null> {
    return this.getItem<InterestItem>(keys.interest(interestId));
  }

  async findBySlug(slug: string): Promise<InterestItem | null> {
    const page = await this.query<InterestItem>(`ISLUG#${slug}`, { indexName: 'gsi1', limit: 1 });
    return page.items[0] ?? null;
  }

  /** A13. `null` parent lists the curated top level. */
  async listChildren(
    parentId: string | null,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<Page<InterestItem>> {
    return this.query<InterestItem>(`PARENT#${parentId ?? 'ROOT'}`, {
      indexName: 'gsi3',
      ascending: true,
      limit: opts.limit ?? 100,
      cursor: opts.cursor ?? null,
    });
  }

  /**
   * A14. Loads the whole catalogue for the in-process cache (research D3). Safe
   * because the catalogue is small - hundreds of top-level, thousands of sub.
   */
  async loadAll(): Promise<InterestItem[]> {
    const all: InterestItem[] = [];
    const tops = await this.pageAll(null);
    all.push(...tops);
    for (const top of tops) all.push(...(await this.pageAll(top.interestId)));
    return all;
  }

  private async pageAll(parentId: string | null): Promise<InterestItem[]> {
    const out: InterestItem[] = [];
    let cursor: string | null = null;
    do {
      const page: Page<InterestItem> = await this.listChildren(parentId, { limit: 200, cursor });
      out.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    return out;
  }
}
