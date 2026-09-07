import { Injectable } from '@nestjs/common';
import { BaseRepository, type Page } from './base.repository';
import { keys } from './keys';

export type PlaceCategory = 'restaurant' | 'cafe' | 'bar' | 'shop' | 'venue' | 'outdoor' | 'other';
export type PlaceStatus = 'active' | 'merged' | 'retired';

export interface PlaceItem {
  placeId: string;
  name: string;
  nameNormalised: string;
  slug: string;
  category: PlaceCategory;
  locality: string;
  localityNormalised: string;
  address: string | null;
  createdBy: string;
  status: PlaceStatus;
  mergedIntoPlaceId: string | null;
  followerCount: number;
  postCount: number;
  createdAt: string;
}

/**
 * Normalisation is the whole dedupe.
 *
 * Every case in apps/e2e/support/places.ts that MUST dedupe differs from its
 * target only by something this function removes; every case that must NOT
 * dedupe survives it. Getting this wrong in the eager direction is worse than
 * not deduping at all - it silently files a post to the wrong restaurant and
 * nobody can tell.
 */
export function normalisePlaceName(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    // A phone keyboard produces U+2019, a desktop one U+0027, and neither person
    // thinks they typed a different restaurant.
    .replace(/['‘’ʼ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    // A leading article is not part of how anyone searches. "The Coconut Club"
    // and "Coconut Club" are one place.
    .replace(/^(the|a|an)\s+/, '')
    .replace(/\s+/g, ' ');
}

export function slugifyPlace(name: string): string {
  return normalisePlaceName(name).replace(/\s+/g, '-');
}

export function normaliseLocality(locality: string): string {
  return locality.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

@Injectable()
export class PlaceRepository extends BaseRepository {
  async find(placeId: string): Promise<PlaceItem | null> {
    return this.getItem<PlaceItem>(keys.place(placeId));
  }

  /**
   * A26 - the dedupe lookup.
   *
   * Uniqueness is per LOCALITY, not global. Two "Joe's Diner" in different
   * cities are two restaurants; a global slug index gets that wrong, and it is
   * the case the fixture set exists to catch.
   */
  async findBySlug(locality: string, slug: string): Promise<PlaceItem | null> {
    const page = await this.query<PlaceItem>(`PSLUG#${normaliseLocality(locality)}#${slug}`, {
      indexName: 'gsi1',
      limit: 1,
    });
    return page.items[0] ?? null;
  }

  /** A27 - the locality catalogue, on GSI3 (Hierarchy: children under a parent). */
  async listByLocality(
    locality: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<Page<PlaceItem>> {
    return this.query<PlaceItem>(`LOCALITY#${normaliseLocality(locality)}`, {
      indexName: 'gsi3',
      limit: opts.limit ?? 100,
      cursor: opts.cursor ?? null,
      ascending: true,
    });
  }

  async create(
    input: Omit<PlaceItem, 'nameNormalised' | 'slug' | 'localityNormalised' | 'followerCount' | 'postCount' | 'status' | 'mergedIntoPlaceId' | 'createdAt'> & {
      createdAt: string;
    },
  ): Promise<PlaceItem> {
    const nameNormalised = normalisePlaceName(input.name);
    const item: PlaceItem = {
      ...input,
      nameNormalised,
      slug: slugifyPlace(input.name),
      localityNormalised: normaliseLocality(input.locality),
      status: 'active',
      mergedIntoPlaceId: null,
      followerCount: 0,
      postCount: 0,
    };
    await this.putItem(
      {
        ...keys.place(item.placeId),
        ...keys.placeBySlug(item.localityNormalised, item.slug),
        ...keys.placeByLocality(item.localityNormalised, item.nameNormalised),
        type: 'Place',
        ...item,
      },
      'attribute_not_exists(pk)',
    );
    return item;
  }

  async setStatus(
    placeId: string,
    status: PlaceStatus,
    mergedIntoPlaceId: string | null = null,
  ): Promise<void> {
    await this.updateItem(keys.place(placeId), { status, mergedIntoPlaceId });
  }

  async rename(place: PlaceItem, name: string): Promise<void> {
    const nameNormalised = normalisePlaceName(name);
    const slug = slugifyPlace(name);
    await this.updateItem(keys.place(place.placeId), {
      name,
      nameNormalised,
      slug,
      ...keys.placeBySlug(place.localityNormalised, slug),
      ...keys.placeByLocality(place.localityNormalised, nameNormalised),
    });
  }

  async incrementFollowerCount(placeId: string, by: number): Promise<void> {
    await this.increment(keys.place(placeId), 'followerCount', by);
  }

  async incrementPostCount(placeId: string, by: number): Promise<void> {
    await this.increment(keys.place(placeId), 'postCount', by);
  }
}
