# ADR-0019: Durable cross-instrument cash reservations and unfunded-maker cancels

- Status: Accepted
- Date: 2026-11-25
- Amends: [ADR-0011](0011-risk-inside-serialized-section.md)

## Context

Matching is serialized per instrument (ADR-0005), and the pre-trade buying-power check ran inside
that section (ADR-0011). Cash, however, is per account and shared by every instrument. Two orders
from one account on two symbols ran in two different sections, each read the same free cash, and
both passed: the account could commit more cash than it had. The `accounts_cash_non_negative`
CHECK only caught the overspend at settlement time, and only when the orders actually traded;
resting orders could still over-reserve indefinitely.

A second, related gap: if a resting maker's balance changes out of band (an operator correction
today; deposits/withdrawals later, TB-305), the maker might be unable to settle when hit, leaving
an unfillable order at the top of the book.

## Decision Drivers

- No account may ever have more cash committed than it holds, across any number of instruments
- The guarantee must be durable (survive restarts) and checkable
- No deadlocks between instrument sections, account locks and database row locks
- Deterministic replay must still reproduce every book exactly

## Considered Options

1. Derive reservations from all in-memory books (previous behaviour) and rely on the settlement CHECK
2. A single global serializer for all instruments
3. Per-account actor that owns all reservations, called from instrument sections
4. **Durable `reserved_cash_minor` column with a conditional reservation UPDATE, guarded by an
   in-process per-account mutex taken inside the instrument section**

## Decision Outcome

Option 4.

- Migration `0003_cash_reservations` adds `accounts.reserved_cash_minor` (backfilled from open buy
  orders) with `CHECK (reserved_cash_minor >= 0 AND reserved_cash_minor <= cash_minor)`.
- Invariant: reserved = Σ price × remaining over the account's resting buy orders.
- A buy order reserves its worst-case notional (limit: price × qty; market: exact sweep cost of the
  book it is about to meet) with
  `UPDATE accounts SET reserved_cash_minor = reserved_cash_minor + $amt WHERE id = $1 AND cash_minor - reserved_cash_minor >= $amt RETURNING id`
  in the same transaction as the journal entry. No row returned ⇒ the order is rejected with
  `insufficient_buying_power` and nothing is journaled or installed.
- Releases and adjustments are computed by the pure `reservationDeltas` function: incoming buy
  releases its reservation and re-reserves only what rests; a maker buy fill releases price × qty
  together with the cash debit; cancels (user, IOC/FOK/market remainder, `insufficient_funds`)
  release price × remaining. Expiry (DAY/GTD, TB-204) must go through the same cancel path.
- Lock order: instrument section (promise chain) → account mutex (`KeyedMutex`). No code waits for
  an instrument section while holding an account lock, so the in-process wait-for graph is acyclic.
  Inside the transaction every touched account row is locked `FOR UPDATE` in ascending id order, so
  two instruments settling overlapping accounts cannot deadlock in Postgres (a `40P01` would still
  map to 409 `SETTLEMENT_CONFLICT` defensively).
- Unfunded makers: the incoming order is dry-run (pure) first; makers whose account cannot cover
  the dry run's settlement (cash `min(cash, reserved)` for buys, position for sells) are removed by a
  journaled engine `cancel` command with `reason: 'insufficient_funds'`, audited as
  `order.cancelled_insufficient_funds`, and the dry run repeats. The cancel reason is part of the
  journal entry, so replay reproduces it.
- `reconcile()` at boot compares every account's `reserved_cash_minor` with the books.

## Consequences

- Good: overspend across instruments is impossible by construction and enforced by the database.
- Good: available cash shown to users is a single column read, not a scan of every book.
- Good: unfillable makers are cleaned up deterministically instead of blocking the book.
- Bad: every buy order does one extra conditional UPDATE and row lock on its account; hot accounts
  (market makers quoting many instruments) serialize on that row. Acceptable for a simulator;
  batching per account is possible later (TB-606).
- Bad: the account mutex is in-process; like the engine itself, the API must run as a single
  instance until TB-608.
- Neutral: sell-side position "reservation" remains per instrument (positions are per instrument
  and already serialized by its section).

Verified by `apps/api/test/reservations.http.test.ts` (12 concurrent orders on two symbols from
one account never exceed its cash; reservations released on fill/cancel/IOC; unfunded sell and buy
makers cancelled with `insufficient_funds`, journaled and replayed) and
`packages/shared/test/lifecycle.test.ts` (`reservationDeltas`).
