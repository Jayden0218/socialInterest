import {
  buildReport,
  formatReport,
  SUPPRESSION_FLOOR,
  MIN_PARTICIPANTS,
  type ReportInput,
} from '../src/reports/outcome-report';

const bigWindow = { from: '2026-01-01', to: '2026-02-01' };

const base = (over: Partial<ReportInput> = {}): ReportInput => ({
  window: bigWindow,
  participants: 100,
  funnel: {
    peopleOnboarded: 100,
    timeToFirstPostSeconds: Array.from({ length: 100 }, (_, i) => (i < 60 ? 100 : 400)),
    firstAttemptSuccesses: 80,
    peopleAttemptingPublish: 100,
  },
  interests: {
    postsPublished: 200,
    postsIntoEstablishedSubInterest: 100,
    subInterestsCreated: 50,
    subInterestsLaterMerged: 10,
  },
  moderation: { reportsFiled: 100, reportsDecidedWithin24h: 80, reportsUndecided: 15 },
  ...over,
});

describe('usage outcome report', () => {
  it('reports misses rather than omitting them (FR-026)', () => {
    const report = buildReport(base());
    const missed = report.measures.filter((m) => m.met === false);
    // 001/SC-004 at 80% against a 90% target, SC-008 at 20% against under-10%,
    // SC-010 at 80% against 95% — all present and all marked not met.
    expect(missed.map((m) => m.criterion)).toEqual(
      expect.arrayContaining(['001/SC-004', '001/SC-008', '001/SC-010']),
    );
    expect(report.measures).toHaveLength(5);
  });

  it('counts undecided reports against SC-010 rather than dropping them (FR-027)', () => {
    // 100 filed, 80 decided in time, 15 never decided. Averaging over decided
    // reports only would give 80/85 = 94% and look nearly fine; the honest
    // figure is 80/100 = 80%, and it is the queue's abandonment that makes the
    // difference. A queue that abandoned everything hard would score 100% on
    // the flattering version.
    const report = buildReport(base());
    const sc010 = report.measures.find((m) => m.criterion === '001/SC-010')!;
    expect(sc010.observed).toBe(80);
    expect(sc010.met).toBe(false);
  });

  it('suppresses a cell below the floor instead of rounding it (FR-028)', () => {
    const report = buildReport(
      base({
        moderation: { reportsFiled: SUPPRESSION_FLOOR - 1, reportsDecidedWithin24h: 1, reportsUndecided: 0 },
      }),
    );
    const sc010 = report.measures.find((m) => m.criterion === '001/SC-010')!;
    expect(sc010.suppressed).toBe(true);
    expect(sc010.observed).toBe('unmeasurable');
  });

  it('says a too-small window is unmeasurable rather than publishing a number (FR-030)', () => {
    const short = buildReport(base({ window: { from: '2026-01-01', to: '2026-01-03' } }));
    expect(short.meaningful).toBe(false);
    expect(short.measures.every((m) => m.observed === 'unmeasurable')).toBe(true);

    const few = buildReport(base({ participants: MIN_PARTICIPANTS - 1 }));
    expect(few.meaningful).toBe(false);
    expect(few.measures.every((m) => m.observed === 'unmeasurable')).toBe(true);
  });

  it('reports a criterion with no source data as unmeasurable, never estimated (FR-025)', () => {
    const report = buildReport(base({ interests: undefined as never }));
    const sc007 = report.measures.find((m) => m.criterion === '001/SC-007')!;
    expect(sc007.observed).toBe('unmeasurable');
    expect(sc007.note).toMatch(/not available/);
  });

  it('contains no field from which an individual could be identified (FR-028, FR-029)', () => {
    // T090. The report is aggregates only. Anything that could single a person
    // out - an id, a handle, a raw timestamp, free text they wrote - must not
    // reach it, and this asserts it structurally rather than by inspection.
    const rendered = formatReport(buildReport(base()));
    for (const forbidden of ['userId', 'handle', 'postId', 'reporterId', 'email', '@']) {
      expect(rendered).not.toContain(forbidden);
    }
    for (const measure of buildReport(base()).measures) {
      const keys = Object.keys(measure);
      expect(keys).toEqual(
        expect.arrayContaining(['criterion', 'target', 'population', 'window', 'observed', 'met', 'suppressed']),
      );
      // Only aggregate-shaped values.
      expect(typeof measure.population).toBe('number');
      expect(['number', 'string']).toContain(typeof measure.observed);
    }
  });
});
