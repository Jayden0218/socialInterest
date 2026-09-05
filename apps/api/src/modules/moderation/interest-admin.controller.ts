import { Body, Controller, HttpCode, HttpStatus, Inject, Param, Patch, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ulid } from 'ulid';
import { DomainError } from '../../common/errors/problem.filter';
import { OperatorGuard } from '../../common/auth/operator.guard';
import { zodBody } from '../../common/http/validation';
import { InterestRepository } from '../../persistence/interest.repository';
import { CATALOGUE_SEARCH, type CatalogueSearch } from '../interests/catalogue.cache';
import { InterestJobService } from './interest-job.service';

const actionSchema = z
  .object({
    action: z.enum(['reparent', 'merge', 'retire']),
    newParentId: z.string().optional(),
    mergeIntoId: z.string().optional(),
  })
  .refine((v) => (v.action === 'reparent' ? !!v.newParentId : true), {
    message: 'newParentId is required to reparent',
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
      const liveChildren = this.catalogue
        .childrenOf(interestId)
        .filter((c) => c.state === 'active');
      if (liveChildren.length > 0) {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'Would orphan posts',
          `"${interest.name}" still has ${liveChildren.length} live sub-interest(s). Re-parent or merge them first.`,
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

    const newParent = this.catalogue.byId(input.newParentId!);
    if (!newParent || newParent.level !== 'top') {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Invalid parent',
        'A sub-interest must be re-parented beneath a top-level interest',
      );
    }
    return this.jobs.startReparent(interestId, newParent.interestId);
  }
}
