import { Inject, Injectable, Logger } from '@nestjs/common';
import { ulid } from 'ulid';
import { InterestRepository } from '../../persistence/interest.repository';
import { InterestFollowRepository } from '../../persistence/interest-follow.repository';
import { PostInterestIndexRepository } from '../../persistence/post-interest-index.repository';
import { InMemoryCatalogueCache } from '../interests/catalogue.cache';
import { handleInterestJob, type InterestJob } from '@sih/workers';

/**
 * FR-030. Merge and re-parent rewrite an unbounded number of items, so they run
 * out of band with a visible progress state.
 *
 * While a merge runs the source is marked `merging`, so reads redirect to the
 * survivor rather than showing a half-moved interest.
 */
@Injectable()
export class InterestJobService {
  private readonly logger = new Logger(InterestJobService.name);
  private readonly jobs = new Map<string, InterestJob>();

  constructor(
    @Inject(InterestRepository) private readonly interests: InterestRepository,
    @Inject(InterestFollowRepository) private readonly follows: InterestFollowRepository,
    @Inject(PostInterestIndexRepository) private readonly index: PostInterestIndexRepository,
    @Inject(InMemoryCatalogueCache) private readonly cache: InMemoryCatalogueCache,
  ) {}

  startMerge(sourceId: string, targetId: string): InterestJob {
    return this.start('merge', sourceId, targetId);
  }

  startReparent(interestId: string, newParentId: string): InterestJob {
    return this.start('reparent', interestId, newParentId);
  }

  getJob(jobId: string): InterestJob | undefined {
    return this.jobs.get(jobId);
  }

  private start(action: 'merge' | 'reparent', sourceId: string, targetId: string): InterestJob {
    const job: InterestJob = {
      jobId: ulid(),
      action,
      state: 'queued',
      itemsProcessed: 0,
      itemsTotal: 0,
    };
    this.jobs.set(job.jobId, job);

    void handleInterestJob(
      { job, sourceId, targetId },
      {
        setState: async (id, state) => {
          await this.interests.setState(id, state);
          await this.cache.refresh();
        },
        setMergedInto: async (id, into) => {
          await this.interests.setMergedInto(id, into);
          await this.cache.refresh();
        },
        setParent: async (id, parentId) => {
          await this.interests.setParent(id, parentId);
          await this.cache.refresh();
        },
        movePosts: async (from, to) => this.index.moveInterest(from, to),
        moveFollowers: async (from, to) => {
          const page = await this.follows.listFollowers(from, { limit: 1000 });
          let moved = 0;
          for (const f of page.items) {
            // Idempotent: re-running a merge must not double-count followers.
            if (!(await this.follows.isFollowing(f.userId, to))) {
              await this.follows.follow(f.userId, to);
            }
            await this.follows.unfollow(f.userId, from);
            moved++;
          }
          return moved;
        },
        onProgress: (updated) => this.jobs.set(updated.jobId, updated),
      },
    ).catch((e: unknown) => {
      this.logger.error(`interest job ${job.jobId} failed: ${String(e)}`);
      this.jobs.set(job.jobId, { ...job, state: 'failed', error: String(e).slice(0, 200) });
    });

    return job;
  }
}
