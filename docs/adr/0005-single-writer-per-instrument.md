# ADR-0005: Single writer per instrument via promise-chain serialization

- Status: Accepted
- Date: 2026-11-24

## Context

Matching requires a total order of commands per instrument. Node.js is single threaded, but `await` points (risk reads, the database transaction) would let two commands interleave on the same book.

## Decision Drivers

- Total order per instrument with dense sequence numbers
- Parallelism across instruments
- No distributed locks

## Considered Options

1. Global mutex for all instruments
2. PostgreSQL row lock (`SELECT ... FOR UPDATE`) on the instrument per command
3. In-process promise chain per instrument (`Venue.serialize`)

## Decision Outcome

Chosen: **promise chain per instrument**. `serialize(symbol, handler)` appends the handler to the instrument's tail promise; failures are caught so the chain continues. Different instruments proceed concurrently.

## Consequences

- Good: dense `seq` under concurrency is verified by a 20-way parallel test.
- Good: no database contention for ordering.
- Bad: only valid with one API process per venue; multi-process needs a leader (TB-608).
- Bad: a slow transaction stalls that instrument's queue (head-of-line blocking).
