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
      type: 'Person',
      ...person,
      ...patch,
    });
  }

  /** FR-003. A non-active author has no followers for visibility purposes. */
  async setStatus(userId: string, status: PersonItem['status']): Promise<void> {
    const person = await this.findById(userId);
    if (!person) return;
    await this.putItem({
      ...keys.person(userId),
      ...keys.personByHandle(person.handle.toLowerCase()),
      type: 'Person',
      ...person,
      status,
    });
  }

  async create(person: PersonItem): Promise<void> {
    await this.putItem(
      {
        ...keys.person(person.userId),
        ...keys.personByHandle(person.handle.toLowerCase()),
        type: 'Person',
        ...person,
      },
      'attribute_not_exists(pk)',
    );
  }
}
