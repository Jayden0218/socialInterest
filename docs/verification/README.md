# Verification evidence

These are **dated records of what was observed**, not design documents. The design lives in
`specs/`; what actually happened lives here.

The distinction matters. Feature 001 recorded intentions in a way that later read as evidence —
"bench written" in a success-criteria table was mistaken for "criterion measured". Keeping the
two in different trees is the fix.

| Path | Holds |
|---|---|
| `approvals.md` | The project owner's explicit, scoped permissions to incur cost |
| `runs/` | One append-only record per verification, load measurement, or journey run |

Rules that apply to everything in here:

- A record is never edited after the run completes. A correction is a new record.
- A result is scoped to the version it was taken on. It is not evidence for a later version.
- "Unverified" and "not implemented" are different states and must not be reported as one.
- An honest negative result is a successful outcome. A missing record is not a passing one.

## Scope note, 2026-09-05

The divergence register and its runbooks were removed when AWS was dropped as the
deployment target: with one implementation per port there is nothing to verify
against a production path. What remains is the approval record (empty), the
templates, and the load measurement that was actually taken.

If a managed service is ever adopted, Principle V applies again and the register
comes back with it.
