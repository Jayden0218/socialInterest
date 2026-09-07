import { Injectable } from '@nestjs/common';
import { BaseRepository } from './base.repository';
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

    // A display name is not in any sort key, so this is a filter. Bounded, and
    // documented as the thing a search backend replaces.
    const byName = await this.query<PersonItem>('PEOPLE', {
      indexName: 'gsi3',
      skPrefix: 'HANDLE#',
      limit: 200,
      ascending: true,
      filter: {
        expression: 'contains(#dn, :q)',
        names: { '#dn': 'displayNameLower' },
        values: { ':q': needle },
      },
    });

    const seen = new Set<string>();
    const merged: PersonItem[] = [];
    for (const p of [...byHandle.items, ...byName.items]) {
      if (seen.has(p.userId) || p.status !== 'active') continue;
      seen.add(p.userId);
      merged.push(p);
    }
    return merged.slice(0, limit);
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
