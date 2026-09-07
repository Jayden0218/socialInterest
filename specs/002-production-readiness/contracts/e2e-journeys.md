# Contract: Core End-to-End Journeys

**Feature**: 002-production-readiness

This document is a **contract**. Per the constitution's workflow gates, the test that enforces
it exists before the implementations it governs.

## Rule

Every journey below MUST be exercised against a **running API over HTTP**, driven through
**the mobile app's own data layer** (`apps/mobile/src/data/`), which in turn uses the generated
client. Driving the generated client directly does not satisfy this contract: both sides are
generated from one document and therefore agree with each other by construction, which proves
nothing about the app's own request construction. A journey satisfied by a stand-in, a mock, or
a fixture does not count as covered, and MUST NOT be recorded as passing.

The negative journeys are the deliberate exception: N-01 to N-04 MUST bypass the app's data
layer and issue raw requests, because their purpose is to exercise the path a hostile client
would take (Principle III).

A journey MUST NOT be removed from this set to make a build pass.

## The core set

| # | Journey | Passes when | Requirement |
|---|---|---|---|
| J-01 | Sign in | A token is obtained and an authenticated request succeeds | FR-001 |
| J-02 | Browse interest catalogue | Interests are returned and are the seeded ones | FR-001 |
| J-03 | Follow an interest | The follow persists and appears on re-read | FR-001 |
| J-04 | Publish an image post | Upload is presigned, the object lands, the post becomes readable | FR-001 |
| J-05 | Publish a video post | The post exists and reaches a ready state | FR-001 |
| J-06 | Browse home feed | Only posts from followed interests appear | FR-001, Principle I |
| J-07 | View an interest space | Returns that interest's posts, respecting visibility | FR-001 |
| J-08 | Comment on a post | The comment persists and is readable by a permitted viewer | FR-001 |
| J-09 | Report content | The report is filed and enters the moderation queue | FR-001, Principle IV |
| J-10 | Block a person | The block takes effect on every read surface immediately | FR-001, Principle II |

## Negative journeys — required, not optional

| # | Journey | Passes when | Requirement |
|---|---|---|---|
| N-01 | Unauthenticated request to a protected route | Rejected with 401, no data leaked | FR-001 |
| N-02 | Read a private post as a non-author | Not returned, and indistinguishable from absent | Principle II |
| N-03 | Read a post from a blocked person | Not returned on any surface | Principle II |
| N-04 | Request media a viewer is not permitted to see, directly | Not served | Principle III, FR-019 |

**N-04 runs in Tier A against the local object store and again in Tier C against the production
delivery path.** Passing locally is not evidence for the production path (Principle V).

## Contract drift

The committed generated client MUST match what regenerating from `contracts/openapi.yaml`
produces. A difference fails the build (FR-003). The journeys then run against the regenerated
client, so a document that no longer describes the running API fails here rather than in
front of a person.
