# Tickbook

[![CI](https://github.com/mayur19/tickbook/actions/workflows/ci.yml/badge.svg)](https://github.com/mayur19/tickbook/actions/workflows/ci.yml)

**Learn, teach and test trading strategies against a real matching engine, without real money or
real market data.**

Tickbook is a simulated exchange for finance educators, students and strategy hobbyists. Participant
firms register, receive paper-trading accounts funded with simulated cash, and send orders to a
deterministic central limit order book with price-time priority. Every engine input is journaled in
PostgreSQL so books are rebuilt exactly after a restart, and live Level-2 depth and trades stream to
the browser over WebSocket. It is a teaching venue: there is no connection to any real market, broker
or data feed, and nothing on it has monetary value.

> **Project status: early build.** The foundation (auth, sessions, CSRF, RBAC, throttling, audit) and
> the hardest core slice are implemented and tested: the matching engine for limit, market, IOC and
> FOK orders, the Postgres command journal with replay recovery, durable cross-instrument cash
> reservations, place/cancel APIs with pre-trade risk, the L2 depth WebSocket and the trading screen.
> Everything else is designed, documented and tracked in the [backlog](docs/planning/backlog.md):
> **10.9 %** of the estimated effort is complete (160 of 1,468 hours, see
> [implementation status](docs/planning/implementation-status.md)). Pending API endpoints answer
> `501 Not Implemented` with their ticket id, and pending screens carry a "Planned" badge.

## Project status

| Area                                                                                          | Status                   | Tickets                  |
| --------------------------------------------------------------------------------------------- | ------------------------ | ------------------------ |
| Monorepo, CI on native PostgreSQL, `run.sh`, migrations, config, error envelope               | ✅ Implemented           | TB-001 to TB-007         |
| Auth (scrypt, Postgres sessions, CSRF, RBAC), login throttling, audit log, 501 stubs          | ✅ Implemented           | TB-008 to TB-012         |
| Matching engine: persistent book, price-time priority, limit/market/IOC/FOK, property tests   | ✅ Implemented           | TB-101 to TB-104, TB-113 |
| Command journal, replay recovery, single writer per instrument, place/cancel API              | ✅ Implemented           | TB-105 to TB-107         |
| Pre-trade risk, gross settlement, durable cash reservations, unfunded-maker cancels           | ✅ Implemented           | TB-108, TB-109, TB-306   |
| L2 depth snapshot + incremental WebSocket, trades tape, demo seed                             | ✅ Implemented           | TB-110 to TB-112         |
| Web: login/registration, trade screen (ticket, ladder, tape, open orders), blotter, portfolio | ✅ Implemented           | TB-901 to TB-903, TB-951 |
| Engine performance work (indexed cancel, mutable hot path)                                    | ⏳ Pending               | TB-114, TB-115           |
| Order types and lifecycle: stop, iceberg, post-only, DAY/GTD, STP, amend, mass cancel         | ⏳ Pending               | TB-201 to TB-215         |
| Ledger, P&L, fees, margin, short selling, account risk limits                                 | ⏳ Pending (TB-306 done) | TB-301 to TB-325         |
| Market data: candles, L1 stats, sequenced multi-symbol feed, charts, liquidity bots           | ⏳ Pending               | TB-401 to TB-410         |
| Venue operations: instrument admin, sessions, halts, circuit breakers, opening auction        | ⏳ Pending               | TB-501 to TB-525         |
| Journal browser, snapshots, replay tool, hash chain, group commit, hot standby                | ⏳ Pending               | TB-601 to TB-612         |
| Surveillance (wash trades, spoofing), replay viewer, reports                                  | ⏳ Pending               | TB-701 to TB-722         |
| Members, invitations, API keys, TOTP, email-verified signup, shared throttle store            | ⏳ Pending               | TB-801 to TB-814         |
| Web: hotkeys, P&L portfolio, admin console, surveillance workspace, accessibility             | ⏳ Pending               | TB-904 to TB-911         |
| Operations: metrics, backups drill, systemd/nginx release, load tests, contract tests         | ⏳ Pending               | TB-952 to TB-958         |

## Quick start

Requirements: Node.js 22+, npm, and a natively installed PostgreSQL server (15+, 17 recommended)
that accepts local socket connections (`/tmp`) from your OS user without a password.

```bash
./run.sh
```

This checks prerequisites, creates `.env` from `.env.example` with a random session secret,
installs dependencies, creates the `tickbook_dev` database, applies migrations, seeds demo data
(instruments, firms and a market-maker ladder placed through the real order path) and starts:

- Web: http://localhost:5106
- API: http://127.0.0.1:4106 (proxied by the web dev server under `/api` and `/ws`)

## Demo logins (development only)

These accounts are created by the development seed, are public, and must never exist in a
production database (the seed refuses to run with `NODE_ENV=production`). Password for all:
`tickbook-demo-pass`.

| Email                   | Role   | Organization                                    |
| ----------------------- | ------ | ----------------------------------------------- |
| `demo@tickbook.local`   | Owner  | Northwind Capital                               |
| `trader@tickbook.local` | Trader | Northwind Capital                               |
| `viewer@tickbook.local` | Viewer | Northwind Capital (read-only: cannot trade)     |
| `mm@tickbook.local`     | Owner  | Liquidity Desk (simulated market maker account) |

Seeded instruments (all simulated): `TBK` Tickbook Demo Corp (tick 0.01, lot 1), `ACME` Acme
Robotics (tick 0.05, lot 10) and `GLBX` Globex Energy (tick 0.01, lot 100). Liquidity Desk rests an
eight-level bid/ask ladder on each, and Northwind Capital (1,000,000.00 simulated USD plus starting
positions) has a few fills on the tape and one resting bid. Live quoting bots are TB-410.

## run.sh commands

| Command                                        | Description                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| `./run.sh` / `./run.sh start` / `./run.sh dev` | Install deps, prepare `.env` + database, migrate, seed, launch API + web |
| `./run.sh setup`                               | Everything `start` does, without launching                               |
| `./run.sh migrate`                             | Apply pending database migrations                                        |
| `./run.sh seed`                                | Load development demo data (skipped if users already exist)              |
| `./run.sh reset [--yes]`                       | Drop and recreate the schema, then migrate + seed (asks first)           |
| `./run.sh test`                                | Unit + integration tests against the `tickbook_test` database            |
| `./run.sh e2e`                                 | Playwright end-to-end smoke tests (starts the app if needed)             |
| `./run.sh check`                               | Lint, format check, typecheck and tests (what CI runs)                   |
| `./run.sh build`                               | Production build of API and web                                          |
| `./run.sh help`                                | Show all commands                                                        |

## Tech stack

| Layer    | Technology                                                                                         |
| -------- | -------------------------------------------------------------------------------------------------- |
| API      | Node.js 22, Fastify 5, `@fastify/websocket`, `@fastify/cookie`, TypeScript (strict), zod, pg, pino |
| Engine   | `@tickbook/shared`: pure matching engine, depth diffing, pre-trade risk, zod schemas (no I/O)      |
| Web      | React 18, React Router 6, Vite 7, plain CSS with design tokens                                     |
| Database | PostgreSQL 17, forward-only SQL migrations with checksums, int8 money in minor units               |
| Tests    | Vitest, fast-check (property + differential tests), Testing Library, real PostgreSQL, Playwright   |
| Tooling  | npm workspaces, ESLint, Prettier, tsx, tsup, GitHub Actions (runner's native PostgreSQL)           |

## Repository layout

```
tickbook/
├── apps/
│   ├── api/                         Fastify API
│   │   ├── migrations/              0001_foundation, 0002_trading_core, 0003_cash_reservations
│   │   ├── src/
│   │   │   ├── config/ db/ http/ security/
│   │   │   ├── venue/               implemented: Venue shell, per-account lock, journal, recovery
│   │   │   └── modules/
│   │   │       ├── auth/ audit/ health/       implemented foundation
│   │   │       ├── orders/ accounts/ instruments/ marketdata/   implemented slice
│   │   │       └── pending/                   30 planned routes answering 501 with ticket ids
│   │   └── test/                    HTTP, WebSocket and PostgreSQL integration tests
│   └── web/                         React SPA (trade, blotter, portfolio; "Planned" sections)
├── packages/shared/                 matching engine, depth, risk, schemas + property tests, bench/
├── e2e/                             Playwright config and smoke specs
├── docs/                            product, architecture, ADRs, design, API, security, testing, ops, planning
├── run.sh                           single entry point
└── .env.example                     placeholder configuration
```

## Documentation

Start with the [documentation index](docs/README.md). Key documents:
[PRD](docs/product/PRD.md) ·
[requirements](docs/product/requirements.md) ·
[architecture](docs/architecture/overview.md) ·
[ADRs](docs/adr/README.md) ·
[data model](docs/design/data-model.md) ·
[system design](docs/design/system-design.md) ·
[API](docs/api/README.md) ·
[threat model](docs/security/threat-model.md) ·
[test strategy](docs/testing/test-strategy.md) ·
[runbook](docs/operations/runbook.md) ·
[deployment](docs/operations/deployment.md) ·
[roadmap](docs/planning/roadmap.md) ·
[backlog](docs/planning/backlog.md) ·
[implementation status](docs/planning/implementation-status.md)

## Known limitations

- Simulated venue only: no real money, no real instruments, no external market data, by design.
- Single API instance: engine state, per-account reservation locks and login throttle counters live
  in process (shared throttle store TB-813, hot standby TB-608).
- Only limit and market orders with GTC/IOC/FOK execute; stop, iceberg, post-only and DAY/GTD answer
  501 (TB-201 to TB-204). No self-trade prevention yet (TB-205).
- Settlement is gross cash and positions; no double-entry ledger, fees or P&L yet (TB-301 to TB-311).
  Short selling is not allowed.
- Boot reconciliation of journal vs order table only warns (blocking is TB-603); no snapshots yet, so
  recovery replays the full journal (TB-602).
- Playwright smoke tests run locally (`./run.sh e2e`), not in CI.

## Contributing, security and license

- [Contributing guide](CONTRIBUTING.md): workflow, commit conventions, engine change rules.
- [Security policy](SECURITY.md): how to report vulnerabilities; known in-process limitations.
- [Changelog](CHANGELOG.md).
- Licensed under the [MIT License](LICENSE).
