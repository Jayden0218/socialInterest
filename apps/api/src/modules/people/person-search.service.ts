import { Inject, Injectable } from '@nestjs/common';
import { PersonRepository, type PersonItem } from '../../persistence/person.repository';
import { BlockRepository } from '../../persistence/block.repository';

/**
 * 004/FR-034, FR-035, FR-036.
 *
 * THE BLOCK EXCLUSION LIVES HERE, in one place, applied to whatever the
 * repository returned. It is not in the repository's query, because a filter
 * expression is easy to forget on the next query added there - and a people
 * search that returns somebody who blocked you is how a blocked person finds a
 * way back.
 *
 * BOTH DIRECTIONS. `existsBetween` is symmetric on purpose: 001/FR-044 hides
 * content in both directions, and a search result is content about a person.
 * Testing only one direction is the easy mistake, which is why the journey
 * asserts both.
 */
@Injectable()
export class PersonSearchService {
  constructor(
    @Inject(PersonRepository) private readonly people: PersonRepository,
    @Inject(BlockRepository) private readonly blocks: BlockRepository,
  ) {}

  async search(viewerId: string, q: string, limit = 10): Promise<PersonItem[]> {
    // Over-fetch, because the block filter removes rows after the query and a
    // page of ten that becomes three is a page that looks like no results.
    const candidates = await this.people.search(q, { limit: limit * 3 });

    const kept: PersonItem[] = [];
    for (const person of candidates) {
      if (person.userId === viewerId) continue;
      if (await this.blocks.existsBetween(viewerId, person.userId)) continue;
      kept.push(person);
      if (kept.length >= limit) break;
    }
    return kept;
  }
}
