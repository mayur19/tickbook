# ADR-0010: Journal-then-install: durable transaction before installing state

- Status: Accepted
- Date: 2026-11-24

## Context

Clients must never see effects (acknowledgement, market data) of a command that is not durable, and a database failure must not leave memory and storage diverged.

## Decision Drivers

- No acknowledged-but-lost orders (RPO 0)
- No phantom market data
- Simple failure handling

## Considered Options

1. Install in memory, persist asynchronously (write-behind)
2. Persist outputs after install and repair on failure
3. Compute next state, commit one transaction (journal + orders + trades + settlement + audit), then install and publish

## Decision Outcome

Chosen: **journal-then-install**. Inside the instrument's serialized section the handler computes the next state, commits the transaction, and only then does `Venue` install the state and publish trades/depth. On any error the previous state stays installed and the error maps to an envelope (e.g. duplicate `clientOrderId` 409).

## Consequences

- Good: tested — a failed insert leaves the book and `seq` unchanged.
- Good: market data is always derived from committed state.
- Bad: commit latency is on the critical path (group commit TB-606).
- Bad: a crash after commit but before the HTTP response leaves the client unsure; the order is queryable by id and replay includes it.
