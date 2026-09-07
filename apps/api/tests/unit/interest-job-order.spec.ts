import { handleInterestJob, type InterestJob } from '@sih/workers';

/**
 * THE MERGE JOB'S STEP ORDER IS A CONTRACT, because a test depends on it.
 *
 * interest-merge.spec.ts waits for the REDIRECT as its completion signal, and
 * that is only valid because `setMergedInto` is the LAST thing the job does.
 * If somebody reorders the steps - moving the redirect earlier for a nicer
 * user experience, say - that integration test silently starts racing again,
 * exactly as it did twice already.
 *
 * So the ordering is asserted here rather than assumed there. This test failing
 * is the signal to fix the waiting in interest-merge.spec.ts, not to delete it.
 *
 * It also pins FR-030's own guarantee: nothing is orphaned, because posts and
 * followers move BEFORE the source becomes unreachable under its own id.
 */
describe('handleInterestJob step order (FR-030)', () => {
  const runMerge = async (): Promise<string[]> => {
    const calls: string[] = [];
    const job: InterestJob = {
      jobId: 'j1',
      action: 'merge',
      state: 'queued',
      itemsProcessed: 0,
      itemsTotal: 0,
    };
    await handleInterestJob(
      { job, sourceId: 'from', targetId: 'to' },
      {
        setState: async (_id, state) => {
          calls.push(`setState:${state}`);
        },
        setMergedInto: async () => {
          calls.push('setMergedInto');
        },
        setParent: async () => {
          calls.push('setParent');
        },
        movePosts: async () => {
          calls.push('movePosts');
          return 2;
        },
        moveFollowers: async () => {
          calls.push('moveFollowers');
          return 3;
        },
        onProgress: () => undefined,
      },
    );
    return calls;
  };

  it('marks merging, moves posts, moves followers, THEN redirects', async () => {
    expect(await runMerge()).toEqual([
      'setState:merging',
      'movePosts',
      'moveFollowers',
      'setMergedInto',
    ]);
  });

  it('setMergedInto is last, which is what makes the 301 a completion signal', async () => {
    const calls = await runMerge();
    expect(calls[calls.length - 1]).toBe('setMergedInto');
  });

  it('nothing is orphaned: both moves happen before the source redirects away', async () => {
    const calls = await runMerge();
    expect(calls.indexOf('movePosts')).toBeLessThan(calls.indexOf('setMergedInto'));
    expect(calls.indexOf('moveFollowers')).toBeLessThan(calls.indexOf('setMergedInto'));
  });
});
