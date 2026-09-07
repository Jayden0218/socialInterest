export interface InterestJob {
  jobId: string;
  action: 'merge' | 'reparent';
  state: 'queued' | 'running' | 'complete' | 'failed';
  itemsProcessed: number;
  itemsTotal: number;
  error?: string;
}

export interface InterestJobInput {
  job: InterestJob;
  sourceId: string;
  targetId: string;
}

export interface InterestJobDeps {
  setState(interestId: string, state: 'active' | 'merging' | 'merged' | 'retired'): Promise<void>;
  setMergedInto(interestId: string, mergedIntoId: string): Promise<void>;
  setParent(interestId: string, parentId: string): Promise<void>;
  movePosts(fromInterestId: string, toInterestId: string): Promise<number>;
  moveFollowers(fromInterestId: string, toInterestId: string): Promise<number>;
  onProgress(job: InterestJob): void;
}

/**
 * FR-030 merge and re-parent.
 *
 * Three properties this must hold, all of them things the spec's edge cases
 * demand:
 *
 * 1. NOTHING IS ORPHANED. Posts and followers move to the survivor before the
 *    source is marked merged, so there is no moment at which they belong to an
 *    interest nobody can reach.
 * 2. READS REDIRECT WHILE IT RUNS. The source is `merging` for the duration, so
 *    a visitor sees the survivor rather than a half-moved interest.
 * 3. RE-RUNNING IS SAFE. Every step is idempotent - moving a post that already
 *    moved is a no-op, and a follower who already follows the target is not
 *    followed twice. A job that fails halfway can simply be run again.
 */
export async function handleInterestJob(
  input: InterestJobInput,
  deps: InterestJobDeps,
): Promise<InterestJob> {
  let job: InterestJob = { ...input.job, state: 'running' };
  deps.onProgress(job);

  try {
    if (input.job.action === 'reparent') {
      // Re-parenting moves no posts: index items are keyed by interest, and the
      // interest keeps its identity. Only the hierarchy edge changes.
      await deps.setParent(input.sourceId, input.targetId);
      job = { ...job, state: 'complete', itemsProcessed: 1, itemsTotal: 1 };
      deps.onProgress(job);
      return job;
    }

    // Merge. Mark the source first so reads redirect for the whole operation.
    await deps.setState(input.sourceId, 'merging');
    deps.onProgress(job);

    const posts = await deps.movePosts(input.sourceId, input.targetId);
    job = { ...job, itemsProcessed: posts, itemsTotal: posts };
    deps.onProgress(job);

    const followers = await deps.moveFollowers(input.sourceId, input.targetId);
    job = {
      ...job,
      itemsProcessed: posts + followers,
      itemsTotal: posts + followers,
    };
    deps.onProgress(job);

    // Only now: everything has moved, so the permanent redirect is safe.
    await deps.setMergedInto(input.sourceId, input.targetId);

    job = { ...job, state: 'complete' };
    deps.onProgress(job);
    return job;
  } catch (error) {
    job = { ...job, state: 'failed', error: String(error).slice(0, 200) };
    deps.onProgress(job);
    throw error;
  }
}
