# ADR-0011: Pre-trade risk evaluated inside the serialized section

- Status: Accepted (amended by [ADR-0019](0019-durable-cash-reservations.md))
- Date: 2026-11-24

## Context

Risk checks (buying power, position, fat-finger band, notional) depend on the book (market order cost) and on open-order reservations. Checking outside the instrument queue races with concurrent orders.

## Decision Drivers

- Exact view of the book the order will meet
- No double spending of buying power within one instrument
- Keep risk logic pure and testable

## Considered Options

1. Check before queueing (stale)
2. Database-level reservations table with locking
3. Pure `checkPreTrade` run inside `Venue.serialize`, reservations derived from resting orders

## Decision Outcome

Chosen: **risk inside the serialized section**. Reserved cash is the durable `accounts.reserved_cash_minor` (ADR-0019); position availability subtracts resting sells. Violations persist the order as `rejected` with `risk:<rule>` and are audited, not journaled.

## Consequences

- Good: within one instrument the check is exact.
- Bad (original version): across instruments, two queues could both pass a buying-power check against the same cash. Fixed by ADR-0019: the in-section check is now advisory and a conditional reservation UPDATE under a per-account lock is the durable gate.
- Neutral: limits live on `accounts` today; configurable limits are TB-320.
