# ADR-0015: Property-based and differential testing of the engine

- Status: Accepted
- Date: 2026-11-24

## Context

Example-based tests miss interleavings of order types, partial fills and cancels. The engine's correctness is the product.

## Decision Drivers

- Find edge cases automatically
- Reproducible failures
- An independent oracle

## Considered Options

1. Hand-written scenario tests only
2. Fuzzing with random inputs and crash detection
3. fast-check properties plus a deliberately naive reference matcher compared trade by trade

## Decision Outcome

Chosen: **fast-check** (justified dependency) with invariants (never crossed, well-formed levels, conservation, limit respected, FOK all-or-nothing, IOC/market never rest, deterministic replay, dense trade ids) and a **differential test** against `test/reference-model.ts`, which re-sorts a flat array on every match.

## Consequences

- Good: 300 runs per property in under a second; failures shrink to minimal command sequences.
- Good: the reference model doubles as executable documentation of semantics.
- Bad: new order types must be added to both the engine and the reference model.
- Neutral: mutation testing is planned to measure test strength (TB-958).
