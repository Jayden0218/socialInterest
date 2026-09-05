# Verification evidence

These are **dated records of what was observed**, not design documents. The design lives in
`specs/`; what actually happened lives here.

The distinction matters. Feature 001 recorded intentions in a way that later read as evidence —
"bench written" in a success-criteria table was mistaken for "criterion measured". Keeping the
two in different trees is the fix.

| Path | Holds |
|---|---|
| `divergence-register.md` | Current state of every local/production implementation divergence |
| `approvals.md` | The project owner's explicit, scoped permissions to incur cost |
| `runbooks/` | What would count as proof for each divergence, written **before** the run |
| `runs/` | One append-only record per verification, load measurement, or journey run |

Rules that apply to everything in here:

- A record is never edited after the run completes. A correction is a new record.
- A result is scoped to the version it was taken on. It is not evidence for a later version.
- "Unverified" and "not implemented" are different states and must not be reported as one.
- An honest negative result is a successful outcome. A missing record is not a passing one.
