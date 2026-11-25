# Implementation status

**Overall: 10.9% implemented** (160 of 1,468 estimated engineering hours), as of version 0.1.0.

Tickbook ships a deliberately narrow but complete vertical slice: the hardest core of the product
(a deterministic matching engine with journaled recovery) working end to end through the database,
API, WebSocket and UI, with thorough tests. Everything else is designed, specified and tracked.

## How the percentage is computed

1. Every unit of work is a ticket in [backlog.md](backlog.md) with an hour estimate and a status.
2. A ticket counts as done only when its code, tests and docs are merged and CI is green. Partially
   started work counts as zero.
3. Percentage = sum of hours of `done` tickets / sum of hours of all tickets.
4. Per-area figures use the same rule within each epic.

The numbers below are recomputed whenever a ticket changes status. A quick check:

```bash
python3 - <<'PY'
import re
done=total=0
for line in open('docs/planning/backlog.md'):
    if re.match(r'\| TB-\d{3}', line):
        cols=[c.strip() for c in line.strip().strip('|').split('|')]
        total+=int(cols[3]); done+=int(cols[3]) if cols[4]=='done' else 0
print(done, total, round(100*done/total,1))
PY
```

## Progress by area

| Epic | Area                                                     | Done (h) | Total (h) |  Complete |
| ---- | -------------------------------------------------------- | -------: | --------: | --------: |
| E0   | Foundation                                               |       46 |        46 |      100% |
| E1   | Matching engine core                                     |       73 |       103 |       71% |
| E2   | Order types and lifecycle                                |        0 |       146 |        0% |
| E3   | Accounts, risk, ledger and fees                          |       20 |       290 |        7% |
| E4   | Market data                                              |        0 |       126 |        0% |
| E5   | Venue operations: instruments, sessions, halts, auctions |        0 |       174 |        0% |
| E6   | Journal, snapshots, recovery and performance             |        0 |       154 |        0% |
| E7   | Surveillance and reporting                               |        0 |       128 |        0% |
| E8   | Identity, members and API access                         |        0 |        90 |        0% |
| E9   | Web application                                          |       19 |       151 |       13% |
| E10  | Operations and quality                                   |        2 |        60 |        3% |
|      | **Total**                                                |  **160** | **1,468** | **10.9%** |

## Done

| Area                 | What exists                                                                                                                                                                                                                                         | Evidence                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Tooling              | npm workspaces, strict TypeScript, ESLint, Prettier, Vitest, `run.sh`, CI on native PostgreSQL                                                                                                                                                      | `.github/workflows/ci.yml`, `run.sh`                            |
| Platform             | zod config (incl. `TRUST_PROXY` rules), pino logging with redaction, envelope, error handler, request IDs, health/ready, migration runner with checksums                                                                                            | `apps/api/src/config`, `apps/api/src/http`, `apps/api/src/db`   |
| Auth                 | Firm registration (non-enumerating, 202), login/logout/me, Postgres sessions with HMAC-hashed tokens, CSRF double-submit, RBAC (owner/trader/viewer), audit writes                                                                                  | `apps/api/src/modules/auth`, `auth.http.test.ts`                |
| Login throttling     | Per-email progressive backoff, per-IP attempt limit, per-IP distinct-email cap, reservation before await, bounded store with sweep/eviction, IP normalisation                                                                                       | `apps/api/src/http/login-throttle.ts`, `throttle.test.ts`       |
| Matching engine      | Persistent order book, price-time priority, limit/market, GTC/IOC/FOK, cancel, validation, lifecycle and settlement deltas, L2 depth diff, pre-trade risk                                                                                           | `packages/shared/src`, 67 tests incl. property and differential |
| Journal and recovery | Per-instrument command journal written in the same transaction as orders/trades/settlement; replay on boot; gap detection; reconciliation report                                                                                                    | `apps/api/src/venue`, `recovery.db.test.ts`                     |
| Cash reservations    | Durable cross-instrument reservation of buy notional (conditional UPDATE, per-account mutex, id-ordered row locks), release on fill/cancel/IOC remainder, `insufficient_funds` cancels for unfundable makers, reserved-cash reconciliation (TB-306) | `0003_cash_reservations`, API integration tests                 |
| Order API            | Place, cancel, get, list orders; accounts with reserved/available cash; instruments; L2 book; trades                                                                                                                                                | `apps/api/src/modules`, `orders.http.test.ts`                   |
| Market data stream   | `/ws/market` snapshot + incremental depth + trades with engine sequence numbers; slow-consumer disconnect                                                                                                                                           | `marketdata.ws.ts`, `ws.test.ts`                                |
| Web                  | Login, registration, layout with planned sections, trade screen (ticket, live ladder, tape, open orders), blotter, portfolio                                                                                                                        | `apps/web/src`, 31 component/hook tests, Playwright smoke       |
| Seed                 | Three simulated instruments, two firms, demo users, market-maker ladder placed through the real order path                                                                                                                                          | `apps/api/src/db/seed.ts`                                       |

## Stubbed (routed, answering 501 with a ticket)

| Endpoint                                                  | Ticket |
| --------------------------------------------------------- | ------ |
| `POST /api/v1/orders/{id}/replace`                        | TB-210 |
| `POST /api/v1/orders/mass-cancel`                         | TB-211 |
| `GET /api/v1/orders/{id}/fills`                           | TB-212 |
| `GET /api/v1/accounts/{id}/ledger`                        | TB-301 |
| `GET /api/v1/accounts/{id}/pnl`                           | TB-303 |
| `POST /api/v1/accounts/{id}/deposits`                     | TB-305 |
| `POST /api/v1/accounts`                                   | TB-307 |
| `GET /api/v1/fee-schedules`, `PUT .../{id}`               | TB-310 |
| `PUT /api/v1/accounts/{id}/risk-limits`                   | TB-320 |
| `GET /api/v1/instruments/{symbol}/candles`                | TB-401 |
| `GET /api/v1/instruments/{symbol}/quote`                  | TB-402 |
| `GET /api/v1/instruments/{symbol}/auction`                | TB-521 |
| `POST /api/v1/admin/instruments`                          | TB-501 |
| `PATCH /api/v1/admin/instruments/{symbol}`                | TB-502 |
| `POST /api/v1/admin/instruments/{symbol}/halt`, `/resume` | TB-510 |
| `GET /api/v1/admin/circuit-breakers`                      | TB-512 |
| `POST /api/v1/admin/instruments/{symbol}/auction`         | TB-520 |
| `GET /api/v1/admin/journal/{symbol}`                      | TB-601 |
| `POST /api/v1/admin/snapshots`                            | TB-602 |
| `GET /api/v1/surveillance/alerts`                         | TB-701 |
| `GET /api/v1/surveillance/orders`                         | TB-702 |
| `GET /api/v1/reports/trade-blotter`                       | TB-720 |
| `GET /api/v1/members`, `POST /api/v1/members/invitations` | TB-801 |
| `PATCH /api/v1/members/{userId}`                          | TB-802 |
| `GET /api/v1/audit-logs`                                  | TB-805 |
| `POST /api/v1/api-keys`                                   | TB-810 |
| `POST /api/v1/auth/verify-email`                          | TB-812 |

Order features accepted by the schema but answering 501: `type: stop | stop_limit` (TB-201),
`displayQuantity` iceberg (TB-202), `postOnly` (TB-203), `timeInForce: DAY | GTD` (TB-204).

Web sections shown in the navigation with a "Planned" badge: Charts & candles, Ledger & P&L,
Auctions & halts, Surveillance, Venue admin, Members & API keys.

## Known limitations of the implemented slice

- Cancel is O(levels + orders) because order lookup scans the book (TB-114).
- Out-of-band edits to cash or positions are not prevented; they are absorbed by cancelling resting
  orders that can no longer settle (`insufficient_funds`).
- Settlement is gross (no fees, no ledger postings) until M3.
- Recovery replays the full journal; snapshots arrive in M6 (TB-602).
- Reconciliation mismatches are logged, not blocking (TB-603).
- Login throttle counters are in-process; one API instance only until TB-813.
- WebSocket depth messages are not emitted for every engine sequence (rejected commands change
  nothing), so clients cannot detect gaps from `seq` alone (TB-403).

## Schema status

Migrated: `0001_foundation` (organizations, users, memberships, sessions, audit_log) and
`0002_trading_core` (instruments, accounts, positions, journal, orders, trades) and
`0003_cash_reservations` (`accounts.reserved_cash_minor`). The full target
model, including ledger, fees, candles, sessions calendar, halts, auctions, snapshots, alerts, API
keys and outbox, is documented in [../design/data-model.md](../design/data-model.md).
