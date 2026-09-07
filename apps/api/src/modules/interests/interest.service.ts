import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import { DomainError } from '../../common/errors/problem.filter';
import { InterestRepository, type InterestItem } from '../../persistence/interest.repository';
import { InMemoryCatalogueCache, normaliseName } from './catalogue.cache';
import { HierarchyValidator } from './hierarchy.validator';
import { NamePolicy } from './name-policy';
import { InterestSearch, type SearchResult } from './catalogue.search';

export interface CreateSubInterestInput {
  name: string;
  parentId: string;
  description?: string;
  createdBy: string;
  /** Ids the person was shown as near-duplicates and chose to proceed past. */
  acknowledgedSimilarTo?: string[];
}

export class DuplicateInterestError extends DomainError {
  constructor(readonly candidates: SearchResult[]) {
    super(
      HttpStatus.CONFLICT,
      'A similar interest already exists',
      'Join the existing interest, or choose a more distinct name.',
    );
  }
}

@Injectable()
export class InterestService {
  constructor(
    @Inject(InterestRepository) private readonly repo: InterestRepository,
    @Inject(InMemoryCatalogueCache) private readonly cache: InMemoryCatalogueCache,
    @Inject(HierarchyValidator) private readonly hierarchy: HierarchyValidator,
    @Inject(NamePolicy) private readonly namePolicy: NamePolicy,
    @Inject(InterestSearch) private readonly search: InterestSearch,
  ) {}

  /**
   * FR-022: any signed-in person may create a sub-interest beneath exactly one
   * top-level parent.
   *
   * Order matters. Name policy (FR-031) runs BEFORE the duplicate check and
   * before the conditional write, so a prohibited name is never compared against
   * the catalogue and never reaches the table.
   */
  async createSubInterest(input: CreateSubInterestInput): Promise<InterestItem> {
    const parent = this.hierarchy.requireTopLevelParent(input.parentId);
    this.namePolicy.assertAllowed(input.name);

    const name = input.name.trim();
    const nameNormalised = normaliseName(name);

    // FR-023: an exact collision under this parent always refuses.
    const exact = this.search.findExact(name, parent.interestId);
    if (exact) throw new DuplicateInterestError([{ interest: exact, parent, similarity: 1 }]);

    const similar = this.search.findSimilar(name, parent.interestId);
    const acknowledged = new Set(input.acknowledgedSimilarTo ?? []);
    const unacknowledged = similar.filter((c) => !acknowledged.has(c.interest.interestId));
    if (this.search.isTooSimilar(unacknowledged)) {
      // Not a silent rejection: the candidates come back so the client can offer
      // "join this one instead", which is what SC-008 measures.
      throw new DuplicateInterestError(unacknowledged);
    }

    const interestId = ulid();
    const slug = await this.uniqueSlug(name);
    const now = new Date().toISOString();

    const item: InterestItem = {
      interestId,
      name,
      nameNormalised,
      slug,
      level: 'sub',
      parentId: parent.interestId,
      createdBy: input.createdBy,
      ...(input.description ? { description: input.description } : {}),
      postCount: 0,
      followerCount: 0,
      state: 'active',
      createdAt: now,
    };

    await this.repo.createSubInterest(item);
    // Refresh so the new interest is immediately searchable and postable.
    await this.cache.refresh();
    return item;
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!(await this.repo.findBySlug(base))) return base;
    // Slugs are globally unique while names are unique per parent, so the same
    // name under two parents needs a discriminator.
    for (let i = 2; i < 100; i++) {
      const candidate = `${base}-${i}`;
      if (!(await this.repo.findBySlug(candidate))) return candidate;
    }
    return `${base}-${ulid().slice(-6).toLowerCase()}`;
  }

  /**
   * 004/FR-025, the edit half.
   *
   * Refreshes the catalogue afterwards, because the cache is what every read
   * goes through - a description written to the item and not to the cache would
   * be invisible until the next restart, which is the kind of "saved but not
   * showing" that reads as data loss.
   */
  async setDescription(interestId: string, description: string): Promise<void> {
    await this.repo.setDescription(interestId, description, new Date().toISOString());
    await this.cache.refresh();
  }
}
