# ADR-0007: Price-time priority FIFO with trades at the maker price

- Status: Accepted
- Date: 2026-11-24

## Context

The venue must allocate liquidity in a way that is fair, predictable and teachable, matching how most equity lit books work.

## Decision Drivers

- Fairness and predictability
- Simple to reason about in tests
- Matches common exchange practice for education

## Considered Options

1. Pro-rata allocation
2. Price-size priority
3. Price-time (FIFO) priority; execution price = resting order price

## Decision Outcome

Chosen: **price-time priority**. Best price first; within a level, lowest engine sequence first. An aggressive order trades at each maker's price (price improvement goes to the taker). A partially filled maker keeps its queue position.

## Consequences

- Good: verified against a reference matcher on random streams.
- Good: incentivises posting liquidity early, which the education use case wants to show.
- Neutral: pro-rata markets can be added later as an instrument-level matching mode.
- Bad: amend semantics must define when priority is lost (TB-210: quantity down keeps, price change loses).
