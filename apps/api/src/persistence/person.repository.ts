import { Injectable } from '@nestjs/common';
import { BaseRepository, type Page } from './base.repository';
import { keys } from './keys';

export interface PersonItem {
  userId: string;
  handle: string;
  displayName: string;
  avatarKey?: string;
  bio?: string;
  followerCount: number;
  followingCount: number;
  interestFollowCount: number;
  notificationPrefs: Record<string, boolean>;
  /**
   * 004/FR-034. A lowercase copy for matching: DynamoDB's `contains` is
   * case-sensitive, and a people search that only matches the exact casing
   * somebody typed is not a search.
   */
  displayNameLower?: string;
  status: 'active' | 'deleting' | 'deleted';
  createdAt: string;
}

/** Access patterns A1 (by id) and A2 (by handle, via GSI1). */
@Injectable()
export class PersonRepository extends BaseRepository {
  async findById(userId: string): Promise<PersonItem | null> {
    return this.getItem<PersonItem>(keys.person(userId));
  }

  async findByHandle(handle: string): Promise<PersonItem | null> {
    const page = await this.query<PersonItem>(`HANDLE#${handle.toLowerCase()}`, {
      indexName: 'gsi1',
      limit: 1,
    });
    return page.items[0] ?? null;
  }

  /**
   * A34 / 004/FR-034, FR-036.
   *
   * Handle prefix through the index; display name through a bounded filter over
   * the same partition, because there is no index that answers "contains". Only
   * ACTIVE people are returned - FR-036 - and the block exclusion is applied by
   * the service above, never here, so there is one place it can be forgotten
   * rather than two.
   */
  async search(q: string, opts: { limit?: number } = {}): Promise<PersonItem[]> {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const limit = Math.min(opts.limit ?? 10, 25);

    const byHandle = await this.query<PersonItem>('PEOPLE', {
      indexName: 'gsi3',
      skPrefix: `HANDLE#${needle}`,
      limit: limit * 4,
      ascending: true,
    });

    const byName = await this.searchByDisplayName(needle, limit);

    const seen = new Set<string>();
    const merged: PersonItem[] = [];
    for (const p of [...byHandle.items, ...byName]) {
      if (seen.has(p.userId) || p.status !== 'active') continue;
      seen.add(p.userId);
      merged.push(p);
    }
    return merged.slice(0, limit);
  }

  /**
   * A DISPLAY NAME IS IN NO SORT KEY, so this is a filter - and DynamoDB applies
   * `Limit` to the items it EXAMINES, before the filter runs.
   *
   * The previous version passed `limit: 200` in one query and took what came
   * back. That does not mean "up to 200 matches"; it means "look at 200 people,
   * then filter". Past 200 accounts a match beyond them was invisible, silently,
   * with the endpoint answering 200 OK and an empty list.
   *
   * It was not theoretical and it was not caught by design review. FR-034 - a
   * renamed person is findable under their NEW name - went red in CI the moment
   * feature 005's journeys pushed the account count past 200; one cap test alone
   * creates 45 people. The requirement had already been false for any deployment
   * with 200 accounts. The suite had simply never been big enough to ask.
   *
   * So this PAGES until it has enough matches or has examined `EXAMINE_BUDGET`
   * people. Bounded on purpose: an unbounded scan behind a public endpoint is a
   * denial of service waiting to be found, and a caller cannot raise the budget.
   * The real answer is the search backend D3 defers until post-content search
   * arrives; this makes the interim honest rather than quietly wrong, and the
   * budget is the number to raise the day it is not enough.
   */
  private static readonly EXAMINE_BUDGET = 2_000;
  private static readonly EXAMINE_PAGE = 200;

  private async searchByDisplayName(needle: string, limit: number): Promise<PersonItem[]> {
    const found: PersonItem[] = [];
    let cursor: string | undefined;
    let examined = 0;

    while (examined < PersonRepository.EXAMINE_BUDGET) {
      const page: Page<PersonItem> = await this.query<PersonItem>('PEOPLE', {
        indexName: 'gsi3',
        skPrefix: 'HANDLE#',
        limit: PersonRepository.EXAMINE_PAGE,
        ascending: true,
        ...(cursor ? { cursor } : {}),
        filter: {
          expression: 'contains(#dn, :q)',
          names: { '#dn': 'displayNameLower' },
          values: { ':q': needle },
        },
      });
      found.push(...page.items);
      examined += PersonRepository.EXAMINE_PAGE;

      // No cursor means the index is exhausted - every person has been
      // considered, and stopping here is complete rather than merely bounded.
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
      // Enough to fill the caller's page even before block filtering removes
      // some. Over-fetching a little beats a second round trip per result.
      if (found.length >= limit * 4) break;
    }
    return found;
  }

  /** Atomic counter, so concurrent follows cannot lose an increment. */
  async incrementCounter(
    userId: string,
    attribute: 'followerCount' | 'followingCount' | 'interestFollowCount',
    by: number,
  ): Promise<void> {
    await this.increment(keys.person(userId), attribute, by);
  }

  async updateProfile(
    userId: string,
    patch: Partial<Pick<PersonItem, 'displayName' | 'bio' | 'avatarKey' | 'notificationPrefs'>>,
  ): Promise<void> {
    const person = await this.findById(userId);
    if (!person) throw new Error(`person ${userId} not found`);
    await this.putItem({
      ...keys.person(userId),
      ...keys.personByHandle(person.handle.toLowerCase()),
      ...keys.personSearch(person.handle.toLowerCase()),
      type: 'Person',
      ...person,
      ...patch,
      // Rewritten on every profile edit, or a renamed person stays findable
      // only under the name they used to have.
      displayNameLower: (patch.displayName ?? person.displayName).toLowerCase(),
    });
  }

  /** FR-003. A non-active author has no followers for visibility purposes. */
  async setStatus(userId: string, status: PersonItem['status']): Promise<void> {
    const person = await this.findById(userId);
    if (!person) return;
    await this.putItem({
      ...keys.person(userId),
      ...keys.personByHandle(person.handle.toLowerCase()),
      ...keys.personSearch(person.handle.toLowerCase()),
      type: 'Person',
      ...person,
      displayNameLower: person.displayName.toLowerCase(),
      status,
    });
  }

  async create(person: PersonItem): Promise<void> {
    await this.putItem(
      {
        ...keys.person(person.userId),
        ...keys.personByHandle(person.handle.toLowerCase()),
        ...keys.personSearch(person.handle.toLowerCase()),
        type: 'Person',
        ...person,
        displayNameLower: person.displayName.toLowerCase(),
      },
      'attribute_not_exists(pk)',
    );
  }
}
