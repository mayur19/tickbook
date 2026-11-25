# Roadmap

Milestones group the tickets in [backlog.md](backlog.md). Hours are the sum of ticket estimates.
Exit criteria are verifiable: each milestone closes only when its criteria pass in CI or in a
documented manual check. Tickbook remains a simulated venue at every milestone.

| Milestone | Theme                                 | Tickets (main)                                                         | Hours | Status                    |
| --------- | ------------------------------------- | ---------------------------------------------------------------------- | ----: | ------------------------- |
| M0        | Foundation                            | TB-001..TB-012                                                         |    46 | done                      |
| M1        | Matching engine first slice           | TB-101..TB-113, TB-901..TB-903, TB-951                                 |    94 | done                      |
| M2        | Full order types and lifecycle        | TB-201..TB-212, TB-214, TB-215, TB-956                                 |   142 | not started               |
| M3        | Ledger, P&L, fees and account risk    | TB-114, TB-301..TB-308, TB-310, TB-311, TB-320..TB-322, TB-324, TB-905 |   220 | in progress (TB-306 done) |
| M4        | Market data products                  | TB-401..TB-408, TB-410, TB-904                                         |   128 | not started               |
| M5        | Venue operations and auctions         | TB-501..TB-524, TB-906                                                 |   182 | not started               |
| M6        | Durability, snapshots and performance | TB-115, TB-409, TB-601..TB-607, TB-609..TB-612, TB-952..TB-958         |   210 | not started               |
| M7        | Surveillance, members and API access  | TB-213, TB-701..TB-721, TB-801..TB-814, TB-907, TB-908                 |   242 | not started               |
| M8        | Advanced simulation and polish        | TB-309, TB-312, TB-323, TB-325, TB-525, TB-608, TB-722, TB-909..TB-911 |   204 | not started               |

Total: 1,468 hours (160 done). Hours are summed from the Milestone column of the backlog.

## M0 Foundation (done)

Goal: a repository anyone can clone and run against a native PostgreSQL in one command.

Exit criteria (met): `./run.sh setup` works on a fresh clone; CI green on the runner's PostgreSQL;
register/login/logout/me with sessions, CSRF and RBAC; audit write path; throttled login with
`TRUST_PROXY` handling; every planned endpoint answers 501 with its ticket.

## M1 Matching engine first slice (done)

Goal: a correct, deterministic central limit order book that firms can trade on through the API and UI.

Exit criteria (met): limit/market orders with GTC/IOC/FOK under price-time priority; property and
differential tests (300 runs each) green; journal in Postgres with replay recovery proven equal to
the live state; pre-trade risk; gross settlement; L2 snapshot + incremental WebSocket; trade screen
with ticket, depth ladder, tape and open orders; Playwright smoke passes locally.

## M2 Full order types and lifecycle

Goal: the order vocabulary of a typical equities venue.

Exit criteria: stop/stop-limit with cascading triggers, iceberg replenishment, post-only, DAY/GTD
expiry, self-trade prevention modes, amend semantics (quantity down keeps priority) and mass cancel,
each with property tests extending the reference model; private order event stream; the OpenAPI
contract test (TB-956) proves `x-status` matches the router; no 501 remains for order types.

## M3 Ledger, P&L, fees and account risk

Goal: money that adds up.

Exit criteria: every fill posts balanced double-entry journals (sum of postings = 0 per journal,
enforced by a constraint and property test); balances and positions derive from the ledger;
realised/unrealised P&L by average cost and FIFO agree with a hand-computed fixture set; maker/taker
fees with tiers and a documented rounding policy; cross-instrument cash reservations (done in TB-306)
extended to short-sale and margin requirements; configurable account limits and message rate limits;
nightly ledger reconciliation reports zero breaks on seeded data.

## M4 Market data products

Goal: the data a strategy or a chart needs.

Exit criteria: OHLCV candles from 1s to 1d that equal a recomputation from raw trades; L1 quote with
session statistics; per-channel sequence numbers with a tested gap-recovery protocol; multi-symbol
subscriptions; conflation for slow consumers; SVG candle and depth charts; configurable in-process
liquidity bots that keep demo books alive.

## M5 Venue operations and auctions

Goal: run the venue like an operator.

Exit criteria: instruments listed and edited through the admin API without restart; trading calendar
and session state machine; halts/resumes and price bands as journaled engine commands; circuit
breakers with cool-down; opening/closing call auction whose uncrossing price matches a brute-force
search on randomized books (TB-524); indicative price published during the call phase; admin console.

## M6 Durability, snapshots and performance

Goal: fast recovery and measured latency.

Exit criteria: periodic engine snapshots with recovery from snapshot + journal tail in under 5
seconds for 10 million journaled commands; reconciliation mismatch blocks trading; hash-chained
journal; group commit raises durable throughput to at least 5,000 orders/s per instrument on the
reference VM; p99 HTTP-to-ack latency under 5 ms at 1,000 orders/s; metrics endpoint; chaos test for
crash-between-commit-and-install passes; mutation score of at least 80% on the engine.

## M7 Surveillance, members and API access

Goal: a multi-user venue with oversight.

Exit criteria: venue operator role; cross-firm order search; wash-trade, spoofing/layering and
marking-the-close detectors with triage workflow; market replay viewer; member invitations, role
changes, password reset and email-verified signup via the local outbox; HMAC-signed API keys with
cancel-on-disconnect; optional TOTP; throttle counters in Postgres (multi-instance ready).

## M8 Advanced simulation and polish

Goal: depth for education and research use.

Exit criteria: margin model with liquidation, short selling with borrow, volume fee tiers, corporate
actions, volatility auctions, hot standby with documented promotion, strategy sandbox running scripted
strategies against replayed data, strategy scorecards, WCAG 2.1 AA audit passed, tablet layout.
