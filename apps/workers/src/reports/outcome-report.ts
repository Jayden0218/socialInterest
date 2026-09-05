/**
 * The usage outcome report (002/US4).
 *
 * Answers the five feature-001 criteria that no test can produce, because they
 * are about what real people do: 001/SC-001, SC-004, SC-007, SC-008, SC-010.
 *
 * Every rule in contracts/outcome-report.md is enforced here rather than left to
 * whoever runs it:
 *
 *  - aggregates only, never a row about a person (FR-028);
 *  - cells under 20 people are suppressed, never rounded or merged;
 *  - a criterion that cannot be derived is `unmeasurable`, never estimated;
 *  - a window too small to mean anything says so instead of publishing a number;
 *  - misses are reported, and undecided reports count AGAINST the moderation
 *    criterion rather than being dropped from the denominator.
 */

export const SUPPRESSION_FLOOR = 20;
export const MIN_PARTICIPANTS = 50;
export const MIN_WINDOW_DAYS = 14;

export type Criterion = '001/SC-001' | '001/SC-004' | '001/SC-007' | '001/SC-008' | '001/SC-010';

export interface OutcomeMeasure {
  criterion: Criterion;
  target: string;
  population: number;
  window: { from: string; to: string };
  observed: number | 'unmeasurable';
  met: boolean | 'n/a';
  suppressed: boolean;
  note?: string;
}

export interface PublishFunnelFacts {
  /** Distinct people who opened the app in the window. */
  peopleOnboarded: number;
  /** Seconds from first open to first publish, one entry per person. */
  timeToFirstPostSeconds: number[];
  /** People whose FIRST publish attempt succeeded. */
  firstAttemptSuccesses: number;
  /** People who made at least one publish attempt. */
  peopleAttemptingPublish: number;
}

export interface InterestFacts {
  postsPublished: number;
  /** Posts filed under a sub-interest that already had posts. */
  postsIntoEstablishedSubInterest: number;
  subInterestsCreated: number;
  subInterestsLaterMerged: number;
}

export interface ModerationFacts {
  reportsFiled: number;
  /** Reports decided within 24 hours. */
  reportsDecidedWithin24h: number;
  /** Reports with NO decision at all. Counted as missed, never dropped. */
  reportsUndecided: number;
}

export interface ReportInput {
  window: { from: string; to: string };
  participants: number;
  funnel?: PublishFunnelFacts;
  interests?: InterestFacts;
  moderation?: ModerationFacts;
}

export interface UsageReport {
  window: { from: string; to: string };
  participants: number;
  meaningful: boolean;
  measures: OutcomeMeasure[];
}

const windowDays = (w: { from: string; to: string }): number =>
  Math.round((Date.parse(w.to) - Date.parse(w.from)) / 86_400_000);

function unmeasurable(criterion: Criterion, target: string, input: ReportInput, note: string): OutcomeMeasure {
  return {
    criterion,
    target,
    population: input.participants,
    window: input.window,
    observed: 'unmeasurable',
    met: 'n/a',
    suppressed: false,
    note,
  };
}

/** A percentage, or suppression when the cell is too small to publish. */
function rate(
  criterion: Criterion,
  target: string,
  input: ReportInput,
  numerator: number,
  denominator: number,
  meets: (pct: number) => boolean,
): OutcomeMeasure {
  if (denominator < SUPPRESSION_FLOOR) {
    return {
      criterion,
      target,
      population: input.participants,
      window: input.window,
      observed: 'unmeasurable',
      met: 'n/a',
      suppressed: true,
      note: `fewer than ${SUPPRESSION_FLOOR} people in this cell; suppressed rather than rounded`,
    };
  }
  const pct = Math.round((numerator / denominator) * 1000) / 10;
  return {
    criterion,
    target,
    population: input.participants,
    window: input.window,
    observed: pct,
    met: meets(pct),
    suppressed: false,
  };
}

export function buildReport(input: ReportInput): UsageReport {
  const days = windowDays(input.window);
  const meaningful = input.participants >= MIN_PARTICIPANTS && days >= MIN_WINDOW_DAYS;
  const tooSmall =
    `window of ${days} day(s) with ${input.participants} participant(s) is below the ` +
    `${MIN_WINDOW_DAYS}-day / ${MIN_PARTICIPANTS}-person floor; a figure here would not mean anything`;

  const measures: OutcomeMeasure[] = [];

  // 001/SC-001 — first post within 3 minutes of opening the app.
  const t1 = 'first post within 3 minutes of opening the app';
  if (!meaningful) measures.push(unmeasurable('001/SC-001', t1, input, tooSmall));
  else if (!input.funnel) measures.push(unmeasurable('001/SC-001', t1, input, 'publish funnel events not available'));
  else {
    const within = input.funnel.timeToFirstPostSeconds.filter((s) => s <= 180).length;
    measures.push(
      rate('001/SC-001', t1, input, within, input.funnel.timeToFirstPostSeconds.length, (p) => p >= 50),
    );
  }

  // 001/SC-004 — 90% publish their first post on the FIRST attempt.
  const t4 = '90% publish their first post on the first attempt';
  if (!meaningful) measures.push(unmeasurable('001/SC-004', t4, input, tooSmall));
  else if (!input.funnel) measures.push(unmeasurable('001/SC-004', t4, input, 'publish funnel events not available'));
  else {
    measures.push(
      rate('001/SC-004', t4, input, input.funnel.firstAttemptSuccesses, input.funnel.peopleAttemptingPublish, (p) => p >= 90),
    );
  }

  // 001/SC-007 — 70% of posts land in a sub-interest that already has posts.
  const t7 = '70% of posts filed under a sub-interest that already has posts';
  if (!meaningful) measures.push(unmeasurable('001/SC-007', t7, input, tooSmall));
  else if (!input.interests) measures.push(unmeasurable('001/SC-007', t7, input, 'interest assignment facts not available'));
  else {
    measures.push(
      rate('001/SC-007', t7, input, input.interests.postsIntoEstablishedSubInterest, input.interests.postsPublished, (p) => p >= 70),
    );
  }

  // 001/SC-008 — fewer than 10% of new sub-interests later merged away.
  const t8 = 'under 10% of new sub-interests later merged away as duplicates';
  if (!meaningful) measures.push(unmeasurable('001/SC-008', t8, input, tooSmall));
  else if (!input.interests) measures.push(unmeasurable('001/SC-008', t8, input, 'interest merge facts not available'));
  else {
    measures.push(
      rate('001/SC-008', t8, input, input.interests.subInterestsLaterMerged, input.interests.subInterestsCreated, (p) => p < 10),
    );
  }

  // 001/SC-010 — 95% of reports decided within 24 hours.
  const t10 = '95% of reports receive a decision within 24 hours';
  if (!meaningful) measures.push(unmeasurable('001/SC-010', t10, input, tooSmall));
  else if (!input.moderation) measures.push(unmeasurable('001/SC-010', t10, input, 'moderation log not available'));
  else {
    /**
     * FR-027. The denominator is EVERY report filed, including those that never
     * received a decision. Averaging over decided reports only would report the
     * best number exactly when moderation is failing worst - a queue that
     * abandons everything difficult would score 100%.
     */
    const filed = input.moderation.reportsFiled;
    measures.push(rate('001/SC-010', t10, input, input.moderation.reportsDecidedWithin24h, filed, (p) => p >= 95));
  }

  return { window: input.window, participants: input.participants, meaningful, measures };
}

export function formatReport(report: UsageReport): string {
  const lines: string[] = [];
  lines.push(`# Usage outcomes — ${report.window.from} to ${report.window.to}`);
  lines.push('');
  lines.push(`Participants: ${report.participants}`);
  if (!report.meaningful) {
    lines.push('');
    lines.push('**This window is too small for the figures to mean anything.** Every');
    lines.push('criterion is reported as unmeasurable rather than given a number.');
  }
  lines.push('');
  lines.push('| Criterion | Target | Observed | Met? | Note |');
  lines.push('|---|---|---|---|---|');
  for (const m of report.measures) {
    const observed = m.observed === 'unmeasurable' ? 'unmeasurable' : `${m.observed}%`;
    const met = m.met === 'n/a' ? '—' : m.met ? 'yes' : '**no**';
    lines.push(`| ${m.criterion} | ${m.target} | ${observed} | ${met} | ${m.note ?? ''} |`);
  }
  lines.push('');
  lines.push('Aggregates only. No individual is identifiable from this report, and any');
  lines.push(`cell derived from fewer than ${SUPPRESSION_FLOOR} people is suppressed rather than rounded.`);
  return lines.join('\n');
}

/** CLI: `pnpm --filter @sih/workers report:outcomes --window <from>..<to>` */
if (require.main === module) {
  const arg = process.argv.find((a) => a.startsWith('--window='));
  const [from, to] = (arg?.split('=')[1] ?? '').split('..');
  if (!from || !to) {
    console.error('usage: report:outcomes --window=<from>..<to>   (ISO dates)');
    process.exit(2);
  }
  // No deployment and no participants exist, so there is nothing to aggregate.
  // Saying so is the correct output; inventing figures would not be.
  console.log(formatReport(buildReport({ window: { from, to }, participants: 0 })));
}
