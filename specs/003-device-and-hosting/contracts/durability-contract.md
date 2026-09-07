# Contract: the stack keeps what it is given

**Feature**: 003-device-and-hosting

What "durable" means here, stated so it cannot be satisfied by a component that merely stays
running. Today none of these hold.

## The restart test

One test, applied to the whole stack rather than a component at a time.

1. Write through the service: a person, a followed interest, a published post with media, a
   comment, a reaction.
2. Stop **every** component — service, datastore, object storage.
3. Start them again.
4. Read all of it back through the service.

**Passes when** 100% of what was written is readable afterwards. A partial pass is a failure:
a stack that keeps posts and loses uploads has not kept what it was given.

## Per-component obligations

| Component | Must survive | Fails today because |
|---|---|---|
| Datastore | Restart and recreate | Runs in memory; everything is lost |
| Object storage | Restart and recreate | Writes into the container's writable layer; uploads are lost on recreate |
| Event delivery | The publishing process dying before the handler runs | Delivered on the next tick with no record; the event is dropped silently |

The event obligation is the one most easily missed and the most damaging. In 002, nothing
subscribed to `post.created`, so a post never left `pending` and was **visible only to its
author** — nobody could see anyone else's post. An event lost to a crash produces exactly that
state, for exactly that post, permanently.

## Identity

| | Requirement |
|---|---|
| A token signed with the development secret | **Refused** |
| The refusal | Indistinguishable from any other invalid token — no message that reveals which secret was expected |

This is Principle III: enforced server-side, and verified through the path a hostile client
would take rather than the well-behaved one.

## The visibility contract still passes

The full matrix, over every surface it covers today, against the durable stack (FR-009). A
change to where data lives must not narrow what is checked. Principle II is non-negotiable:
one filter, every read path through it, every surface enumerated.

## What this does not claim

Durability is not deployment. This contract is satisfied by a stack that survives restarts and
refuses development tokens. It says nothing about a public address, availability, backups,
multi-region behaviour, or anything else a production estate needs — all explicitly out of
scope in the spec.
