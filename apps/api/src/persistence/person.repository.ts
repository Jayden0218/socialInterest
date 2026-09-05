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
