# ADR-0009: Linear-scan order lookup for cancel (index deferred)

- Status: Accepted
- Date: 2026-11-24

## Context

Cancel and duplicate-id checks need to locate a resting order by id. An index from orderId to level would need to be maintained immutably on every change.

## Decision Drivers

- Keep the first slice simple and correct
- Avoid an O(n) copy of an index map per command
- Know when to revisit

## Considered Options

1. Immutable Map index copied per command
2. Persistent hash map dependency
3. Linear scan over both sides (`findOrder`), revisit with TB-114

## Decision Outcome

Chosen: **linear scan** for now: O(total resting orders) per cancel. Simulator books hold tens to hundreds of resting orders, so this is cheaper than maintaining an index. TB-114 adds an indexed lookup when books grow.

## Consequences

- Good: zero bookkeeping; impossible for the index to drift from the book.
- Bad: cancel cost grows linearly with resting orders; the trigger to revisit is p99 cancel latency above 100 µs in the benchmark.
- Neutral: the API pre-checks existence in memory before journaling a cancel, so unknown ids never reach the journal.
