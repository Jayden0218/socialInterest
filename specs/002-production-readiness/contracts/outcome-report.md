# Contract: Usage Outcome Report

**Feature**: 002-production-readiness

Defines what the real-usage report may contain and, more importantly, what it may not.

## Privacy rules — binding

1. **Aggregates only.** No row, field, or export may describe an individual person (FR-028).
2. **Suppression floor.** Any cell derived from fewer than 20 people is suppressed. Suppressed
   cells are marked as suppressed, never rounded, estimated, or silently merged.
3. **Purpose limit.** A person's activity is used to operate the product and to produce these
   aggregates. Nothing else (FR-029).
4. No free-text authored by a person appears in the report.

## Reporting rules — binding

5. **Misses are reported.** Every criterion appears with its observed figure against its target,
   including and especially when the target was missed (FR-026). A criterion may not be omitted
   from a report because it looked bad.
6. **Undecided reports count as misses.** The moderation criterion is computed from the
   append-only moderation log; reports that received no decision within the window count against
   it (FR-027). Averaging over decided reports only is forbidden — it reports the best number
   exactly when moderation is failing worst.
7. **Insufficient data is stated, not estimated.** A window with fewer than 50 participants or
   shorter than 14 days yields `unmeasurable` for the affected criteria (FR-030).
8. **Windows are declared before they open.** Population, window, and cadence are fixed in
   advance (FR-024). Choosing the window after seeing the data is not measurement.
9. **Unmeasurable is a valid result.** A criterion that cannot be derived from what the product
   records is reported as unmeasurable until the gap is closed (FR-025). It is never estimated.

## Criteria covered

| 001 criterion | Target | Source |
|---|---|---|
| SC-001 | First post within 3 minutes of opening the app | Client-side timing events, aggregated |
| SC-004 | 90% publish first post on first attempt | Publish attempt and outcome counts |
| SC-007 | 70% of posts filed under a sub-interest that already has posts | Post-to-interest assignment at publish time |
| SC-008 | Under 10% of new sub-interests later merged away | Interest creation and merge records |
| SC-010 | 95% of reports decided within 24 hours | Append-only moderation log, undecided counted as missed |

SC-012 of feature 001 is deliberately absent: it is a post-launch business outcome, out of scope
per spec.md.
