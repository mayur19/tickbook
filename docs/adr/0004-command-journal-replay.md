# ADR-0004: Command (input) journal in PostgreSQL with replay recovery

- Status: Accepted
- Date: 2026-11-24

## Context

After a restart the venue must rebuild every order book exactly as it was, including FIFO queue positions and trade id counters. Orders and trades tables alone do not capture time priority or rejected commands that consumed sequence numbers.

## Decision Drivers

- Exact reconstruction of book state and sequence numbers
- Single source of truth in the same database as orders and balances
- Atomicity with order/trade persistence
- Auditability of every engine input

## Considered Options

1. Snapshot the book to a table after every command
2. Output event log (trades, rests, cancels) and rebuild from events
3. Input command journal `journal(instrument_id, seq, command jsonb)` replayed through the pure engine

## Decision Outcome

Chosen: **input command journal**. Every engine command (place, cancel; including engine-rejected places) is appended with a dense per-instrument `seq` inside the same transaction as its effects. Boot runs `replay(spec, commands)`; a sequence gap aborts startup. Periodic snapshots (TB-602) will bound replay time.

## Consequences

- Good: recovery is a fold of a pure function; tested by comparing recovered and live state.
- Good: the journal is a complete, ordered audit trail of venue inputs.
- Bad: replay time grows with history until snapshots land (TB-602).
- Bad: engine logic changes must remain replay-compatible; engine version stamping is planned (TB-612).
