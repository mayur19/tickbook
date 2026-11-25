# Changelog

All notable changes are documented here. The format follows Keep a Changelog and the project uses
semantic versioning.

## [0.1.0] - 2026-11-25

First public version: foundation plus the matching-engine vertical slice of the simulated venue.

### Added

- Deterministic matching engine in `packages/shared`: persistent order book, price-time priority,
  limit and market orders, GTC/IOC/FOK, cancel, static validation, order lifecycle and settlement
  deltas, L2 depth snapshot and diff, pre-trade risk checks.
- Property-based tests (fast-check) and a differential test against a naive reference matcher;
  in-memory throughput benchmark.
- Fastify API: firm registration, login/logout/me, Postgres sessions with HMAC-hashed tokens, CSRF
  double-submit, RBAC, audit log, login throttling with per-email backoff and per-IP limits,
  `TRUST_PROXY` handling.
- Per-instrument command journal written atomically with orders, trades and settlement; replay
  recovery at boot with gap detection and reconciliation report.
- Order API (place, cancel, get, list), accounts, instruments, L2 book, trades tape, and the
  `/ws/market` WebSocket with snapshot, incremental depth and trades.
- Durable cross-instrument cash reservations (`accounts.reserved_cash_minor`, migration 0003):
  conditional reservation under a per-account lock, release on fill/cancel, `insufficient_funds`
  cancels for resting orders that can no longer settle, reserved-cash reconciliation.
- 501 stubs with ticket references for every planned endpoint and order feature.
- React trading UI: login, registration, trade screen with order ticket, live depth ladder, trades
  tape and open orders; blotter; portfolio; planned sections marked in navigation.
- `run.sh` launcher, seed data with a market-maker ladder, CI on the runner's native PostgreSQL,
  Playwright smoke specs, full documentation set.
