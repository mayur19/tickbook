# ADR-0008: Persistent immutable order book with structural sharing

- Status: Accepted
- Date: 2026-11-24

## Context

ADR-0003 requires a pure engine. The book must support best-price access, level lookup, FIFO append and removal, while letting an aborted command keep the previous version.

## Decision Drivers

- Immutability without full copies
- O(1) best bid/ask
- Simple, verifiable structure

## Considered Options

1. Red-black tree of levels (mutable)
2. Immutable sorted map library
3. Sorted arrays of immutable `PriceLevel` objects (bids descending, asks ascending), binary search for level index, untouched levels shared between versions

## Decision Outcome

Chosen: **sorted level arrays with structural sharing**. Insert finds the level by binary search (O(log L)) and copies the level array (O(L)); a sweep reuses all untouched levels by slicing.

## Consequences

- Good: best price is index 0; depth snapshots are slices.
- Good: no dependency; easy to reason about and property-test.
- Bad: O(L) copy on insert and level removal; fine for simulator depths (~tens of levels), measured p99 38 µs.
- Bad: deep books (thousands of levels) motivate TB-115 (mutable hot path checked against this implementation as an oracle).
