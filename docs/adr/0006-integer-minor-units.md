# ADR-0006: Integer minor units for prices and quantities

- Status: Accepted
- Date: 2026-11-24

## Context

Floating point cannot represent decimal prices exactly, and accumulated notional errors corrupt P&L and settlement. PostgreSQL `bigint` arrives in node-postgres as a string by default.

## Decision Drivers

- Exact arithmetic for price × quantity
- Simple comparisons in the engine
- Fail loudly rather than silently lose precision

## Considered Options

1. Decimal library (decimal.js) everywhere
2. `numeric` columns and strings
3. Safe integers in minor units, `bigint` columns, and an int8 parser that throws above `Number.MAX_SAFE_INTEGER`

## Decision Outcome

Chosen: **integer minor units** (prices in cents for USD instruments, quantities in units). The `pg` int8 parser converts to `number` and throws if the value is not a safe integer. Formatting uses `formatMinor`/`parseMinor` (string based, no floats).

## Consequences

- Good: engine code is plain integer math; tick/lot checks are modulo operations.
- Good: notional up to 9e15 minor units is exact.
- Bad: average price is a derived fraction (`filled_notional / filled_quantity`) rounded for display only.
- Bad: instruments with more than 2 price decimals need a per-instrument scale (planned with tick tables TB-503).
