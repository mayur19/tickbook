# Backlog

Every ticket in the product, done or pending. Estimates are engineering hours for one experienced
engineer, including tests and docs. `implementation-status.md` derives the completion percentage
from this table (hours done / total hours), so keep it current when tickets move.

Status: `done` = merged with tests; `pending` = not started (the API surface may exist as a 501 stub).

Milestones are defined in [roadmap.md](roadmap.md). Requirements (FR/NFR) are in
[../product/requirements.md](../product/requirements.md).

## E0 Foundation

| ID     | Title                                                                     | Milestone | Est (h) | Status | Depends on |
| ------ | ------------------------------------------------------------------------- | --------- | ------: | ------ | ---------- |
| TB-001 | npm workspaces monorepo, TypeScript strict, ESLint, Prettier, Vitest      | M0        |       6 | done   | -          |
| TB-002 | zod-validated config loader and structured pino logging with redaction    | M0        |       3 | done   | TB-001     |
| TB-003 | JSON envelope, central error handler, request IDs, 404 handler            | M0        |       3 | done   | TB-001     |
| TB-004 | Forward-only SQL migration runner (checksums, advisory lock, per-file tx) | M0        |       5 | done   | TB-001     |
| TB-005 | Health and readiness endpoints                                            | M0        |       1 | done   | TB-003     |
| TB-006 | `run.sh` launcher (prereqs, .env bootstrap, DB create, migrate, seed)     | M0        |       4 | done   | TB-004     |
| TB-007 | CI on native runner PostgreSQL: lint, format, typecheck, test, build      | M0        |       3 | done   | TB-001     |
| TB-008 | Register firm / login / logout / me with Postgres-backed sessions         | M0        |       8 | done   | TB-004     |
| TB-009 | CSRF double-submit check and RBAC permission skeleton                     | M0        |       4 | done   | TB-008     |
| TB-010 | Audit log write path                                                      | M0        |       2 | done   | TB-004     |
| TB-011 | Login throttling: per-email backoff, per-IP limits, IP normalisation      | M0        |       5 | done   | TB-008     |
| TB-012 | Pending endpoints registered as 501 with ticket references                | M0        |       2 | done   | TB-003     |

## E1 Matching engine core

| ID     | Title                                                                       | Milestone | Est (h) | Status  | Depends on     |
| ------ | --------------------------------------------------------------------------- | --------- | ------: | ------- | -------------- |
| TB-101 | Persistent (immutable) central limit order book with binary-searched levels | M1        |       6 | done    | TB-001         |
| TB-102 | Price-time priority matching for limit and market orders                    | M1        |      10 | done    | TB-101         |
| TB-103 | IOC and FOK time-in-force semantics                                         | M1        |       4 | done    | TB-102         |
| TB-104 | Property-based and differential tests against a naive reference matcher     | M1        |       8 | done    | TB-102         |
| TB-105 | Per-instrument command journal in Postgres and replay recovery at boot      | M1        |       8 | done    | TB-102, TB-004 |
| TB-106 | Venue shell: serialized single-writer execution per instrument              | M1        |       5 | done    | TB-105         |
| TB-107 | Place / cancel / get / list order API                                       | M1        |       8 | done    | TB-106         |
| TB-108 | Basic pre-trade risk: buying power, position, notional, fat-finger band     | M1        |       6 | done    | TB-107         |
| TB-109 | Gross settlement of cash and positions in the matching transaction          | M1        |       3 | done    | TB-107         |
| TB-110 | L2 depth snapshot, incremental diff and market-data WebSocket               | M1        |       8 | done    | TB-106         |
| TB-111 | Recent trades endpoint                                                      | M1        |       2 | done    | TB-107         |
| TB-112 | Seed: instruments, demo firms, market-maker ladder through the order path   | M1        |       3 | done    | TB-107         |
| TB-113 | In-memory engine throughput benchmark                                       | M1        |       2 | done    | TB-102         |
| TB-114 | Indexed order lookup (orderId -> level) to make cancel O(log L)             | M3        |       6 | pending | TB-101         |
| TB-115 | Mutable hot-path book with copy-on-snapshot (keep pure API as oracle)       | M6        |      24 | pending | TB-114, TB-602 |

## E2 Order types and lifecycle

| ID     | Title                                                                    | Milestone | Est (h) | Status  | Depends on |
| ------ | ------------------------------------------------------------------------ | --------- | ------: | ------- | ---------- |
| TB-201 | Stop and stop-limit orders with trigger book and cascade handling        | M2        |      24 | pending | TB-102     |
| TB-202 | Iceberg orders: display quantity, replenishment loses time priority      | M2        |      16 | pending | TB-102     |
| TB-203 | Post-only orders (reject or reprice when they would take liquidity)      | M2        |       8 | pending | TB-102     |
| TB-204 | DAY / GTD time in force with session-end expiry commands                 | M2        |      12 | pending | TB-505     |
| TB-205 | Self-trade prevention modes: cancel newest / oldest / both / decrement   | M2        |      14 | pending | TB-102     |
| TB-206 | Minimum quantity and all-or-none resting semantics                       | M2        |      10 | pending | TB-102     |
| TB-207 | Market-to-limit and protection bands for market orders                   | M2        |       8 | pending | TB-102     |
| TB-210 | Cancel/replace (amend): quantity-down keeps priority, price change loses | M2        |      14 | pending | TB-114     |
| TB-211 | Mass cancel by account, symbol or firm                                   | M2        |       6 | pending | TB-114     |
| TB-212 | Execution reports per order (fills endpoint)                             | M2        |       6 | pending | TB-107     |
| TB-213 | Cancel-on-disconnect for WebSocket/API-key sessions                      | M7        |      10 | pending | TB-810     |
| TB-214 | Order lifecycle event stream for the owning firm (private WebSocket)     | M2        |      14 | pending | TB-110     |
| TB-215 | Order validation reason catalogue with stable public reject codes        | M2        |       4 | pending | TB-107     |

## E3 Accounts, risk, ledger and fees

| ID     | Title                                                                                       | Milestone | Est (h) | Status  | Depends on     |
| ------ | ------------------------------------------------------------------------------------------- | --------- | ------: | ------- | -------------- |
| TB-301 | Double-entry settlement ledger (journals, postings, balanced invariant)                     | M3        |      28 | pending | TB-109         |
| TB-302 | Ledger-derived balances; cash/positions become projections                                  | M3        |      16 | pending | TB-301         |
| TB-303 | Realised and unrealised P&L (average cost and FIFO lots)                                    | M3        |      20 | pending | TB-302, TB-401 |
| TB-304 | End-of-day mark-to-market and statements                                                    | M3        |      12 | pending | TB-303         |
| TB-305 | Simulated cash deposits/withdrawals with approval                                           | M3        |       8 | pending | TB-301         |
| TB-306 | Durable cross-instrument cash reservations with per-account lock and unfunded-maker cancels | M3        |      20 | done    | TB-108         |
| TB-307 | Multiple trading accounts per firm, account CRUD                                            | M3        |       8 | pending | TB-008         |
| TB-308 | Short selling with borrow availability and margin requirement                               | M3        |      24 | pending | TB-306         |
| TB-309 | Margin model (initial/maintenance), margin calls and auto-liquidation                       | M8        |      40 | pending | TB-308         |
| TB-310 | Maker/taker fee schedules with tiers and effective dating                                   | M3        |      14 | pending | TB-301         |
| TB-311 | Fee calculation and posting per fill, rounding policy                                       | M3        |      10 | pending | TB-310         |
| TB-312 | Volume-based fee tiers recalculated monthly                                                 | M8        |       8 | pending | TB-311         |
| TB-320 | Configurable risk limits per account (API + UI)                                             | M3        |      10 | pending | TB-306         |
| TB-321 | Order rate limits per account (messages per second, kill switch)                            | M3        |      10 | pending | TB-306         |
| TB-322 | Pre-trade risk: max open orders, max daily loss, restricted instruments                     | M3        |      12 | pending | TB-303         |
| TB-323 | Post-trade risk dashboard (exposure, concentration)                                         | M8        |      16 | pending | TB-303         |
| TB-324 | Ledger reconciliation job (ledger vs trades vs positions)                                   | M3        |      10 | pending | TB-302         |
| TB-325 | Corporate actions simulation (splits, dividends)                                            | M8        |      24 | pending | TB-302         |

## E4 Market data

| ID     | Title                                                                      | Milestone | Est (h) | Status  | Depends on |
| ------ | -------------------------------------------------------------------------- | --------- | ------: | ------- | ---------- |
| TB-401 | OHLCV candle aggregation (1s..1d) from trades, persisted rollups           | M4        |      20 | pending | TB-111     |
| TB-402 | Level-1 quote endpoint with session statistics (open/high/low/VWAP/volume) | M4        |       8 | pending | TB-401     |
| TB-403 | Per-channel message sequence numbers and gap recovery protocol             | M4        |      12 | pending | TB-110     |
| TB-404 | Multi-symbol subscription protocol over one socket (subscribe/unsubscribe) | M4        |      10 | pending | TB-403     |
| TB-405 | SVG candle chart and depth chart in the web app                            | M4        |      16 | pending | TB-401     |
| TB-406 | Level-3 (order-by-order) feed for surveillance and replay tools            | M4        |      14 | pending | TB-403     |
| TB-407 | Conflation for slow consumers and per-connection send budgets              | M4        |      10 | pending | TB-403     |
| TB-408 | Historical trades query with cursor pagination and CSV export              | M4        |       8 | pending | TB-111     |
| TB-409 | Market-data fan-out benchmark (1k subscribers)                             | M6        |       8 | pending | TB-407     |
| TB-410 | Simulated liquidity providers (configurable quoting bots, in-process)      | M4        |      20 | pending | TB-107     |

## E5 Venue operations: instruments, sessions, halts, auctions

| ID     | Title                                                                        | Milestone | Est (h) | Status  | Depends on     |
| ------ | ---------------------------------------------------------------------------- | --------- | ------: | ------- | -------------- |
| TB-501 | List a new instrument (admin API) with hot registration in the venue         | M5        |      10 | pending | TB-106         |
| TB-502 | Edit instrument rules (tick/lot tables, bands) with effective sequencing     | M5        |      12 | pending | TB-501         |
| TB-503 | Tick-size tables (price-dependent tick sizes)                                | M5        |       8 | pending | TB-502         |
| TB-504 | Venue operator role and admin RBAC separate from firm roles                  | M5        |       8 | pending | TB-009         |
| TB-505 | Trading calendar and session state machine (pre-open, open, close, closed)   | M5        |      16 | pending | TB-501         |
| TB-510 | Trading halts and resumes as journaled engine commands                       | M5        |      12 | pending | TB-505         |
| TB-511 | Static and dynamic price bands (limit up/limit down)                         | M5        |      14 | pending | TB-510         |
| TB-512 | Circuit breakers: volatility interruption triggers and cool-down             | M5        |      16 | pending | TB-511         |
| TB-520 | Opening/closing call auction: order collection phase                         | M5        |      12 | pending | TB-505         |
| TB-521 | Indicative uncrossing price publication during the call phase                | M5        |       8 | pending | TB-522         |
| TB-522 | Uncrossing algorithm (max volume, min imbalance, market pressure, reference) | M5        |      24 | pending | TB-520         |
| TB-523 | Auction allocation with price-time priority and residual handling            | M5        |      12 | pending | TB-522         |
| TB-524 | Auction property tests against brute-force price search                      | M5        |      10 | pending | TB-522         |
| TB-525 | Volatility auction after circuit breaker trigger                             | M8        |      12 | pending | TB-512, TB-523 |

## E6 Journal, snapshots, recovery and performance

| ID     | Title                                                                       | Milestone | Est (h) | Status  | Depends on |
| ------ | --------------------------------------------------------------------------- | --------- | ------: | ------- | ---------- |
| TB-601 | Journal browser API and UI (by instrument, sequence range)                  | M6        |       8 | pending | TB-105     |
| TB-602 | Engine snapshots: periodic serialized state + replay from snapshot          | M6        |      16 | pending | TB-105     |
| TB-603 | Boot reconciliation that blocks trading on mismatch (today: warning only)   | M6        |       8 | pending | TB-105     |
| TB-604 | Deterministic replay tool: rebuild any instrument to any sequence (CLI)     | M6        |      10 | pending | TB-602     |
| TB-605 | Journal hash chain (each entry commits to the previous) for tamper evidence | M6        |       8 | pending | TB-105     |
| TB-606 | Group commit / batched journal writes to raise durable throughput           | M6        |      16 | pending | TB-105     |
| TB-607 | Worker-thread engine per instrument group with message passing              | M6        |      24 | pending | TB-606     |
| TB-608 | Hot standby: follower replays journal via LISTEN/NOTIFY, promotion runbook  | M8        |      28 | pending | TB-602     |
| TB-609 | Journal archival and partitioning by instrument/month                       | M6        |      10 | pending | TB-602     |
| TB-610 | End-to-end latency benchmark (HTTP to ack, journal fsync included)          | M6        |       8 | pending | TB-606     |
| TB-611 | Chaos tests: crash between journal commit and install, restart consistency  | M6        |      12 | pending | TB-603     |
| TB-612 | Engine version stamping in journal entries for replay compatibility         | M6        |       6 | pending | TB-105     |

## E7 Surveillance and reporting

| ID     | Title                                                              | Milestone | Est (h) | Status  | Depends on     |
| ------ | ------------------------------------------------------------------ | --------- | ------: | ------- | -------------- |
| TB-701 | Surveillance alert model, triage workflow and alert API            | M7        |      16 | pending | TB-504         |
| TB-702 | Cross-firm order and trade search for venue operators              | M7        |      12 | pending | TB-504         |
| TB-703 | Wash-trade detection (same beneficial owner on both sides)         | M7        |      12 | pending | TB-701         |
| TB-704 | Spoofing/layering heuristics on order-to-trade ratios and cancels  | M7        |      20 | pending | TB-701, TB-406 |
| TB-705 | Marking-the-close and momentum ignition detectors                  | M7        |      16 | pending | TB-701         |
| TB-706 | Market replay viewer (book reconstruction at any sequence)         | M7        |      20 | pending | TB-604         |
| TB-720 | Trade blotter CSV export per firm                                  | M7        |       6 | pending | TB-107         |
| TB-721 | Daily venue statistics report (volume, trades, spreads) in-app     | M7        |      10 | pending | TB-401         |
| TB-722 | Strategy scorecards for education use (fill rate, slippage vs mid) | M8        |      16 | pending | TB-303         |

## E8 Identity, members and API access

| ID     | Title                                                                   | Milestone | Est (h) | Status  | Depends on |
| ------ | ----------------------------------------------------------------------- | --------- | ------: | ------- | ---------- |
| TB-801 | Member list and invitations (local outbox delivery)                     | M7        |      12 | pending | TB-008     |
| TB-802 | Role changes, removal, last-owner protection                            | M7        |       6 | pending | TB-801     |
| TB-803 | Password reset via local outbox token                                   | M7        |       8 | pending | TB-812     |
| TB-804 | Session management (list/revoke sessions, rotate on privilege change)   | M7        |       6 | pending | TB-008     |
| TB-805 | Audit log search API and UI                                             | M7        |       8 | pending | TB-010     |
| TB-810 | API keys for strategy clients (HMAC request signing, scopes, rotation)  | M7        |      16 | pending | TB-009     |
| TB-811 | Optional TOTP second factor (in-house RFC 6238)                         | M7        |      12 | pending | TB-008     |
| TB-812 | Email-verified signup via local outbox (replace immediate registration) | M7        |      10 | pending | TB-008     |
| TB-813 | Move login throttle counters to Postgres for multi-instance deployments | M7        |       6 | pending | TB-011     |
| TB-814 | Local outbox table and dev mail viewer                                  | M7        |       6 | pending | TB-004     |

## E9 Web application

| ID     | Title                                                                      | Milestone | Est (h) | Status  | Depends on     |
| ------ | -------------------------------------------------------------------------- | --------- | ------: | ------- | -------------- |
| TB-901 | Web shell: login, registration, layout, planned sections                   | M1        |       6 | done    | TB-008         |
| TB-902 | Trade screen: order ticket, depth ladder, trades tape, open orders         | M1        |      10 | done    | TB-110         |
| TB-903 | Order blotter and portfolio pages                                          | M1        |       3 | done    | TB-107         |
| TB-904 | Keyboard-driven ticket (hotkeys, quantity presets, click-to-trade ladder)  | M4        |      10 | pending | TB-902         |
| TB-905 | Portfolio with P&L, ledger drill-down and statements                       | M3        |      12 | pending | TB-303         |
| TB-906 | Venue admin console (instruments, sessions, halts, auctions)               | M5        |      20 | pending | TB-501, TB-510 |
| TB-907 | Surveillance workspace (alerts, replay viewer)                             | M7        |      20 | pending | TB-701, TB-706 |
| TB-908 | Members, invitations and API key management screens                        | M7        |      10 | pending | TB-801, TB-810 |
| TB-909 | Accessibility pass (WCAG 2.1 AA), screen-reader ladder announcements       | M8        |      12 | pending | TB-902         |
| TB-910 | Responsive layout for tablets                                              | M8        |       8 | pending | TB-902         |
| TB-911 | Strategy sandbox: upload a scripted strategy, run it against replayed data | M8        |      40 | pending | TB-604, TB-810 |

## E10 Operations and quality

| ID     | Title                                                                  | Milestone | Est (h) | Status  | Depends on |
| ------ | ---------------------------------------------------------------------- | --------- | ------: | ------- | ---------- |
| TB-951 | Playwright smoke specs (login, trade, planned sections)                | M1        |       2 | done    | TB-902     |
| TB-952 | Prometheus-format metrics endpoint (latency histograms, queue depth)   | M6        |      10 | pending | TB-106     |
| TB-953 | Backup/restore drill automation and journal-consistent restore check   | M6        |       8 | pending | TB-603     |
| TB-954 | systemd units, nginx config and release script for VM deployment       | M6        |       8 | pending | TB-007     |
| TB-955 | Load test harness (synthetic order flow at configurable rates)         | M6        |      12 | pending | TB-610     |
| TB-956 | OpenAPI contract tests (every operation's x-status matches the router) | M2        |       6 | pending | TB-012     |
| TB-957 | Data retention jobs (sessions, audit, journal archive)                 | M6        |       6 | pending | TB-609     |
| TB-958 | Mutation testing on the engine package                                 | M6        |       8 | pending | TB-104     |

## Totals

| Status    | Tickets |     Hours |
| --------- | ------: | --------: |
| done      |      30 |       160 |
| pending   |     102 |     1,308 |
| **total** | **132** | **1,468** |

Completion by hours: 160 / 1,468 = **10.9%**.
