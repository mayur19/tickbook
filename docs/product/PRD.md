# Product Requirements Document: Tickbook

> **Simulated venue.** Tickbook is an educational exchange simulator and paper-trading venue. It
> does not route orders to any real market, holds no real money, and consumes no external market
> data. Every price, order and balance in it is simulated.

## 1. Vision

Give students, educators and strategy builders a realistic, inspectable exchange: a central limit
order book with exchange-grade matching semantics, pre-trade risk, settlement and market data,
where every state change is journaled and can be replayed deterministically. Users should be able
to see _why_ an order filled the way it did, down to the sequence number.

## 2. Problem

- Finance courses explain price-time priority, IOC/FOK, auctions and circuit breakers on slides,
  but students rarely get to watch a real matching engine apply them to their own orders.
- Retail paper-trading tools simulate fills against delayed quotes. They do not model queue
  position, partial fills, liquidity taken from the book, or self-trade rules, so strategies look
  better on paper than they would on a venue.
- Hobbyist quants who want to test execution logic need a venue that behaves deterministically and
  can be reset, replayed and inspected, without signing contracts for market data feeds.
- Venue-operations and surveillance concepts (halts, uncrossing, spoofing detection) have no hands-on
  teaching environment at all.

## 3. Personas

| Persona                    | Description                                                                   | Primary needs                                                                    |
| -------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Finance educator (Elena)   | Teaches market microstructure to undergraduates; runs classroom trading games | Reset-able venue, instruments with clear rules, replay of a session, scorecards  |
| Student trader (Sam)       | Learns by doing; trades from a browser                                        | Clear order ticket, live depth ladder, honest fills, readable reject reasons     |
| Quant hobbyist (Quinn)     | Writes small execution strategies                                             | API access, deterministic behaviour, fills report, latency that is not a toy     |
| Firm owner (Olivia)        | Sets up a paper-trading firm for a club or class team                         | Register firm, invite members, assign roles, set risk limits                     |
| Venue operator (Victor)    | Runs the simulated venue for a course                                         | List instruments, define sessions, halt/resume, run opening auctions             |
| Surveillance analyst (Ana) | Teaches or practices market-abuse detection                                   | Cross-firm order search, alerts (wash trades, spoofing), book replay at any time |

## 4. Goals

1. **Correct matching**: price-time priority with exchange semantics for every supported order type,
   proven by property-based and differential tests against an obviously-correct reference model.
2. **Determinism and recoverability**: the engine is a pure state transition; the per-instrument
   journal rebuilds identical books after a restart.
3. **Trustworthy money**: integer minor units everywhere; settlement (and later the double-entry
   ledger) always balances.
4. **Live, honest market data**: L2 depth snapshots plus incremental updates and a trades tape over
   WebSocket, sequenced by the engine.
5. **Multi-tenant teaching use**: many participant firms trade against each other on one venue with
   strict isolation of private data (orders, accounts, counterparty identities).
6. **Self-hostable**: Node.js + PostgreSQL on one VM, no containers, no outbound network calls.

## 5. Non-goals

- Real trading, brokerage, custody or any connection to real venues, brokers or banks.
- Licensed market data, reference data feeds or corporate-action feeds (all simulated in-house).
- Regulatory reporting to real regulators.
- Microsecond wire-to-wire latency or kernel-bypass networking; the target is "realistic for
  teaching and strategy testing", not production exchange latency.
- Derivatives (options/futures), multi-leg orders and cross-currency settlement in the first year.

## 6. Scope

### In scope (target product)

- Participant firms, members, roles, API keys, audit log.
- Instruments with tick size, lot size, price bands, session calendar.
- Order types: limit, market, stop, stop-limit, iceberg, post-only; TIF GTC, IOC, FOK, DAY, GTD;
  self-trade prevention; amend and mass cancel.
- Pre-trade risk: buying power, positions, notional, fat-finger bands, order rate limits.
- Accounts with cash and positions; double-entry settlement ledger; maker/taker fees; P&L.
- Market data: L1/L2 (and L3 for surveillance), trades tape, OHLCV candles.
- Venue operations: halts, circuit breakers, opening/closing call auctions with uncrossing.
- Journal, snapshots, deterministic replay tools, hot standby.
- Surveillance alerts, cross-firm search, replay viewer, reports.

### Implemented today (first slice, about 10%)

- Foundation: tooling, config, logging, error envelope, migrations, `run.sh`, CI.
- Auth: register firm (generic 202 response that never reveals whether an email exists), login,
  logout, me; Postgres sessions; CSRF double-submit; RBAC (owner / trader / viewer); audit write
  path; login throttling (per-email exponential backoff, per-IP attempt limit, per-IP distinct-email
  cap) and per-IP registration limit; explicit `TRUST_PROXY`.
- Engine (`packages/shared`): limit and market orders, GTC/IOC/FOK, price-time priority, cancel,
  validation against tick/lot/max quantity, pure deterministic `applyCommand`, `replay`.
- API: place / cancel / get / list orders, pre-trade risk (buying power including open-order
  reservations, no short selling, position limit, max notional, fat-finger band), gross settlement,
  per-instrument journal with replay recovery at boot and reconciliation report, L2 book and trades
  endpoints, market-data WebSocket.
- Web: login/registration, layout with planned sections, trade screen (order ticket, live depth
  ladder, trades tape, open orders), order blotter, portfolio.
- All other endpoints of the target API are registered and answer `501 NOT_IMPLEMENTED` with their
  backlog ticket.

See [../planning/implementation-status.md](../planning/implementation-status.md) for the measured
percentage.

## 7. Success metrics

| Metric                                        | Target                                   | How measured                                |
| --------------------------------------------- | ---------------------------------------- | ------------------------------------------- |
| Matching correctness                          | 0 divergences from the reference model   | Differential property test, 300 runs per CI |
| Replay determinism                            | 100% identical state after replay        | Property test + recovery integration test   |
| Engine latency (in-memory, per command)       | p99 < 100 µs                             | `npm run bench -w @tickbook/shared`         |
| Place-order latency (HTTP to response, local) | p99 < 25 ms                              | Load harness (TB-955)                       |
| Classroom session size                        | 30 firms, 200 browsers, 10 instruments   | Load harness + market-data fan-out bench    |
| Time from clone to trading UI                 | < 5 minutes with Node and Postgres ready | `./run.sh` on a fresh machine               |
| Ledger balance                                | Sum of postings per journal = 0, always  | Database constraint + reconciliation job    |
| Educator adoption (post-M5)                   | 3 courses run a full session             | Feedback from pilot instructors             |

## 8. Release plan

Milestones map to the backlog ([../planning/roadmap.md](../planning/roadmap.md) has exit criteria).

| Milestone | Theme                          | Highlights                                                                |
| --------- | ------------------------------ | ------------------------------------------------------------------------- |
| M0        | Foundation                     | Tooling, migrations, auth, CSRF, RBAC, audit, throttling, CI (done)       |
| M1        | First trading slice            | Engine, journal, place/cancel, risk, L2 WebSocket, trade screen (done)    |
| M2        | Full order vocabulary          | Stop, iceberg, post-only, DAY/GTD, STP, amend, mass cancel, private feed  |
| M3        | Money done right               | Double-entry ledger, fees, P&L, account risk actor, configurable limits   |
| M4        | Market data                    | Candles, L1 stats, gap recovery, multi-symbol, charts, liquidity bots     |
| M5        | Venue operations               | Instrument admin, sessions, halts, bands, circuit breakers, auctions      |
| M6        | Resilience and performance     | Snapshots, replay tool, hash chain, group commit, metrics, deployment kit |
| M7        | Firms, access and surveillance | Members, API keys, verified signup, surveillance alerts, replay viewer    |
| M8        | Advanced teaching features     | Margin, volatility auctions, scorecards, strategy sandbox, accessibility  |

## 9. Assumptions and constraints

- TypeScript (strict) on Node.js 22+, PostgreSQL 15+, React + Vite; no containers anywhere (native installs only).
- No third-party runtime services: email is a local outbox, liquidity is simulated by in-process
  bots, and there are no CDNs or analytics.
- Single API process per venue: engine state, per-account reservation locks and login throttles
  live in process until the hot standby (TB-608) and Postgres-backed throttling (TB-813) land.

## 10. Open questions

- Should classroom "seasons" snapshot and archive a venue, or reset it in place?
- Do educators need per-student anonymised leaderboards, or only firm-level scorecards?
- How much of the surveillance feature set should be visible to student firms for teaching?
