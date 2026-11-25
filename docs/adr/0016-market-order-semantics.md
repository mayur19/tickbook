# ADR-0016: Market orders are IOC/FOK only; risk rejections are not journaled

- Status: Accepted
- Date: 2026-11-24

## Context

A market order has no price, so it cannot rest. Separately, pre-trade risk rejections happen before the engine sees an order.

## Decision Drivers

- Unambiguous semantics
- Journal contains only engine inputs
- Rejections still auditable

## Considered Options

1. Allow GTC market orders and convert remainder to limit at last price
2. Treat GTC market silently as IOC
3. Reject GTC market with `invalid_tif_for_market`; persist risk rejections without a journal entry

## Decision Outcome

Chosen: **market orders require IOC or FOK**; an unfilled remainder is cancelled with `market_no_liquidity`. Engine-level rejections (tick, lot, duplicate id) are journaled because they consume a sequence number; **risk rejections are persisted as `rejected` orders and audited but not journaled**, because they never reach the engine.

## Consequences

- Good: explicit failure instead of surprising conversions.
- Good: replay does not depend on account balances at the time of the order.
- Bad: market-to-limit and protection bands need their own order type (TB-207).
