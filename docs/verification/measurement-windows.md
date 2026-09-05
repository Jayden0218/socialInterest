# Measurement windows

Declared **before** a window opens. Choosing the window after seeing the data is
not measurement (002/FR-024).

## Floors

| Rule | Value | Why |
|---|---|---|
| Minimum participants | 50 | Below this a percentage swings on one or two people |
| Minimum duration | 14 continuous days | Shorter windows are dominated by whichever day the group was recruited |
| Suppression floor | 20 people per cell | Smaller cells can single someone out |

A window that closes below either floor yields `unmeasurable`, not a number.

## What each criterion needs

| Criterion | Target | Source | Available today? |
|---|---|---|---|
| `001/SC-001` | First post within 3 minutes of opening the app | Publish-funnel events (`apps/mobile/src/lib/analytics.ts`) | Instrumented; needs real people |
| `001/SC-004` | 90% publish first post on the first attempt | Same, `attempt` carried on the outcome events | Instrumented; needs real people |
| `001/SC-007` | 70% of posts filed under a sub-interest that already has posts | Post-to-interest assignment, via the analytics export | Derivable; needs real posts |
| `001/SC-008` | Under 10% of new sub-interests later merged away | Interest creation and merge records | Derivable; needs real usage |
| `001/SC-010` | 95% of reports decided within 24 hours | The append-only moderation log | Derivable; needs real reports |

`001/SC-012` (second post within 7 days) is deliberately absent — it is a
post-launch business outcome, out of scope for this feature.

## Rules that are not negotiable at reporting time

- **Misses are published.** A criterion may not be dropped from a report because
  it looked bad.
- **Undecided reports count against `001/SC-010`.** The denominator is every
  report filed. Averaging over decided reports only reports the best number
  exactly when moderation is failing worst.
- **Aggregates only.** No row describes a person, and nothing beyond operating
  the product and producing these figures uses their activity.

## Status

**No window has been opened.** It needs a deployment and a real participant
group, both of which are gated on the project owner's approval — tasks T092–T094.
`report:outcomes` runs today and correctly reports every criterion as
unmeasurable, because there is nothing to aggregate.
