import { Body, Controller, HttpCode, HttpStatus, Inject, Param, Patch, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ulid } from 'ulid';
import { DomainError } from '../../common/errors/problem.filter';
import { OperatorGuard } from '../../common/auth/operator.guard';
import { zodBody } from '../../common/http/validation';
import { InterestRepository } from '../../persistence/interest.repository';
import { CATALOGUE_SEARCH, type CatalogueSearch } from '../interests/catalogue.cache';
import { InterestJobService } from './interest-job.service';

// 013. `reparent` and its `newParentId` are gone with the hierarchy. The ROUTE
// is unchanged — this is one operator route with an `action` discriminator, and
// one value of that discriminator no longer exists (FR-025).
const actionSchema = z
  .object({
    action: z.enum(['retire', 'merge']),
    mergeIntoId: z.string().optional(),
  })
  .refine((v) => (v.action === 'merge' ? !!v.mergeIntoId : true), {
    message: 'mergeIntoId is required to merge',
  });

@Controller('moderation')
@UseGuards(OperatorGuard)
export class InterestAdminController {
  constructor(
    @Inject(InterestRepository) private readonly interests: InterestRepository,
    @Inject(CATALOGUE_SEARCH) private readonly catalogue: CatalogueSearch,
    @Inject(InterestJobService) private readonly jobs: InterestJobService,
  ) {}

  /**
   * FR-030. Merge and re-parent move an unbounded number of items, so they run
   * asynchronously and this returns 202 with a job to poll.
   *
   * Retiring a top-level interest that still has live sub-interests is REFUSED.
   * The spec's edge case is explicit that posts must never be orphaned, and the
   * only safe orderings are re-parent the children first or merge them away.
   */
  @Patch('interests/:interestId')
  @HttpCode(HttpStatus.ACCEPTED)
  async administer(@Param('interestId') interestId: string, @Body() body: unknown) {
    const input = zodBody(actionSchema, body);
    const interest = this.catalogue.byId(interestId);
    if (!interest) throw new DomainError(HttpStatus.NOT_FOUND, 'No such interest');
    if (interest.state === 'merging') {
      throw new DomainError(HttpStatus.CONFLICT, 'Interest is already merging');
    }

    if (input.action === 'retire') {
      /**
       * 013. THE ORPHANED-CHILDREN CHECK IS GONE, because there are no children.
       *
       * It refused to retire a top-level interest that still had live
       * sub-interests. Flat interests cannot orphan anything — what a retirement
       * must not orphan now is POSTS, which FR-022/FR-023 handle by keying
       * retirement on whether the interest has any.
       */
      if (interest.postCount > 0) {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'Would orphan posts',
          `"${interest.name}" still has ${interest.postCount} post(s). Merge it instead.`,
        );
      }
      await this.interests.setState(interestId, 'retired');
      return { jobId: ulid(), action: 'retire', state: 'complete', itemsProcessed: 0, itemsTotal: 0 };
    }

    if (input.action === 'merge') {
      const target = this.catalogue.byId(input.mergeIntoId!);
      if (!target) throw new DomainError(HttpStatus.NOT_FOUND, 'No such target interest');
      if (target.interestId === interestId) {
        throw new DomainError(HttpStatus.CONFLICT, 'Cannot merge an interest into itself');
      }
      return this.jobs.startMerge(interestId, target.interestId);
    }

    /**
     * 013. `reparent` IS NO LONGER AN ACTION. Interests are flat.
     *
     * THE ROUTE ITSELF DOES NOT MOVE, which is what FR-025 is about: this is one
     * operator route with an `action` discriminator, and one value of that
     * discriminator is gone. The operator route snapshot is unchanged.
     */
    throw new DomainError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'Unknown action',
      'Interests are flat; re-parenting is no longer possible.',
    );
  }
}
