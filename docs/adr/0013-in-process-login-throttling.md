# ADR-0013: In-process login throttling with a bounded store

- Status: Accepted
- Date: 2026-11-24

## Context

Online password guessing and password spraying must be throttled without letting an attacker lock out real users or exhaust memory. The API runs as a single process today.

## Decision Drivers

- Stop guessing against one account and spraying across many
- Count concurrent attempts correctly
- Bounded memory that cannot be weaponised into a global lockout
- Correct client IP behind a proxy

## Considered Options

1. Combined `ip|email` fixed window
2. Postgres-backed counters now
3. In-process counters: per-email exponential backoff, per-IP window, per-IP distinct-email cap, in a bounded store

## Decision Outcome

Chosen: **in-process throttle** (`http/login-throttle.ts`). `reserve()` is synchronous and counts the attempt before any await; success clears the email counter. After 5 failures an email backs off 1 s doubling to 15 min. Per normalised IP: attempts per minute (`LOGIN_RATE_LIMIT_PER_MINUTE`) and at most 10 distinct emails per window. IPv4-mapped IPv6 becomes IPv4; other IPv6 collapses to /64. `BoundedStore` sweeps expired entries with a resumable cursor over the whole map and, if still full of active lockouts, evicts the entry with the least time left and logs a warning. `TRUST_PROXY` is false, a hop count or a CIDR list, never `true`, and must be set explicitly in production.

## Consequences

- Good: parallel bad logins are limited exactly (tested with 12 concurrent requests).
- Good: filling the store cannot lock out new users (tested).
- Bad: counters reset on restart and are per process; they must move to Postgres before running more than one instance (TB-813).
- Neutral: registration uses a separate per-IP hourly window.
