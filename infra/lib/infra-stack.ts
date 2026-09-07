/**
 * The AWS stack, as a synth-only description.
 *
 * ==========================================================================
 * NOTHING HERE IS DEPLOYED. `cdk synth` is free, needs no account and no
 * credentials; `cdk deploy` and `cdk bootstrap` are NOT part of any task and
 * require explicit approval from the project owner - see plan.md Cost Posture
 * and the constitution's Cost and Environment Constraints.
 * ==========================================================================
 *
 * Written now rather than at deploy time so the shape of the target is reviewable
 * and so CI can catch a stack that no longer matches the data model. Expressed as
 * a plain description rather than against the CDK library, because taking that
 * dependency would be the first step toward running it.
 */

export interface TableIndex {
  name: string;
  partitionKey: string;
  sortKey: string;
  projection: 'ALL' | 'KEYS_ONLY';
}

export interface StackDescription {
  table: {
    name: string;
    partitionKey: string;
    sortKey: string;
    billing: 'PAY_PER_REQUEST';
    ttlAttribute: string;
    pointInTimeRecovery: boolean;
    stream: 'NEW_AND_OLD_IMAGES';
    indexes: TableIndex[];
  };
  buckets: { name: string; publicRead: boolean; lifecycleDays?: number }[];
  compute: { kind: 'fargate' | 'lambda'; name: string; purpose: string }[];
  cdn: { origin: string; purpose: string };
}

/** Mirrors data-model.md § Key schema. A drift here is a drift in production. */
export const stack: StackDescription = {
  table: {
    name: 'sih-main',
    partitionKey: 'pk',
    sortKey: 'sk',
    billing: 'PAY_PER_REQUEST',
    ttlAttribute: 'ttl',
    pointInTimeRecovery: true,
    // The catalogue cache refreshes from this stream (research D3), and the
    // analytics export reads it rather than the table (research D3, SC-007/8).
    stream: 'NEW_AND_OLD_IMAGES',
    indexes: [
      { name: 'gsi1', partitionKey: 'gsi1pk', sortKey: 'gsi1sk', projection: 'ALL' },
      { name: 'gsi2', partitionKey: 'gsi2pk', sortKey: 'gsi2sk', projection: 'ALL' },
      { name: 'gsi3', partitionKey: 'gsi3pk', sortKey: 'gsi3sk', projection: 'ALL' },
      { name: 'gsi4', partitionKey: 'gsi4pk', sortKey: 'gsi4sk', projection: 'ALL' },
      // 004 Inbox. Written and synthesised only - applying this stack is a separately
      // approved action and is not part of any task.
      { name: 'gsi5', partitionKey: 'gsi5pk', sortKey: 'gsi5sk', projection: 'ALL' },
    ],
  },
  buckets: [
    { name: 'sih-media', publicRead: false },
    // Uploads are transient: the original is replaced by a stripped derivative
    // (FR-010), so anything lingering here is a failed job, not content.
    { name: 'sih-uploads', publicRead: false, lifecycleDays: 7 },
    { name: 'sih-analytics', publicRead: false },
  ],
  compute: [
    { kind: 'fargate', name: 'api', purpose: 'Synchronous API (research D2 - no cold start on the SC-005 read path)' },
    { kind: 'lambda', name: 'media-image', purpose: 'FR-010 EXIF strip and image derivatives' },
    { kind: 'lambda', name: 'media-video', purpose: 'FR-009 MediaConvert orchestration' },
    { kind: 'lambda', name: 'interest-jobs', purpose: 'FR-030 merge, re-parent, retire' },
    { kind: 'lambda', name: 'account-deletion', purpose: 'FR-003 purge and anonymisation' },
    { kind: 'lambda', name: 'analytics-export', purpose: 'SC-007 and SC-008 aggregation, off the operational table' },
  ],
  cdn: { origin: 'sih-media', purpose: 'Media delivery' },
};

export function synth(): StackDescription {
  return stack;
}
