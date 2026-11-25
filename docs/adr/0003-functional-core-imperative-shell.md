# ADR-0003: Functional core, imperative shell: pure engine and a Venue shell

- Status: Accepted
- Date: 2026-11-24

## Context

A matching engine must be deterministic for journal replay, easy to test exhaustively, and safe to abort mid-command when persistence fails. Mutable engines make rollback and replay subtle.

## Decision Drivers

- Deterministic replay from inputs
- Trivial rollback when the database transaction fails
- Exhaustive testing without I/O
- Immutability as a codebase convention

## Considered Options

1. Mutable engine object with undo log
2. Event-sourced aggregate with mutable projection
3. Pure `applyCommand(spec, state, cmd) -> { state, events }` plus a shell that owns one mutable cell per instrument

## Decision Outcome

Chosen: **pure core in `packages/shared`, imperative `Venue` in `apps/api/src/venue/venue.ts`**. The engine never reads the clock (timestamps are in the command) and never creates ids (order ids are in the command). The `Venue` holds the current `EngineState` reference per instrument and replaces it only after the command is durable.

## Consequences

- Good: aborting a command is "do not assign the new state".
- Good: the same function powers live trading, recovery, seeding and property tests.
- Bad: immutable updates copy level arrays; acceptable for simulator book depths (see ADR-0008, TB-115).
- Neutral: the shell is the only place where mutation is allowed, which reviewers can check easily.
