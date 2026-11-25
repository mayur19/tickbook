# Architecture overview

Tickbook is a **simulated** exchange: a central limit order book venue for education and strategy
testing. No real money moves, no external market data is consumed, and nothing calls out to the
internet at runtime. This document describes the structure of the system as built today and the
boundaries the planned work (see [../planning/roadmap.md](../planning/roadmap.md)) will respect.

## C4 level 1: system context

```mermaid
flowchart LR
  trader([Trader / student<br/>participant firm member])
  operator([Venue operator<br/>planned: TB-504])
  strat([Strategy client<br/>planned: API keys TB-810])
  tb[[Tickbook simulated venue]]
  trader -- "browser: order ticket, depth ladder, blotter" --> tb
  operator -. "admin console: instruments, halts, auctions" .-> tb
  strat -. "REST + WebSocket with signed requests" .-> tb
```

There are no external systems. Email-like notifications will go to a local `outbox` table
(TB-814); liquidity comes from in-process simulated market makers (seeded today, bots in TB-410).

## C4 level 2: containers

```mermaid
flowchart TB
  subgraph Browser
    web[apps/web<br/>React 18 + Vite SPA]
  end
  subgraph "API host (Node.js 22)"
    api[apps/api<br/>Fastify 5 HTTP + WebSocket]
    venue[Venue shell<br/>one engine state per instrument]
    shared[packages/shared<br/>pure engine, risk, depth, schemas]
  end
  db[(PostgreSQL 15+<br/>journal, orders, trades, accounts, sessions, audit)]
  web -- "HTTPS JSON /api/v1 (cookie session + CSRF header)" --> api
  web -- "WSS /ws/market?symbol=" --> api
  api --> venue
  venue --> shared
  web -. "imports applyDepthUpdates, formatMinor, schemas" .-> shared
  api -- "pg pool, one transaction per command" --> db
```

| Container         | Responsibility                                                                                  | Technology                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `apps/web`        | Login/registration, trade screen, blotter, portfolio, planned-section placeholders              | React 18, React Router 6, plain CSS tokens                    |
| `apps/api`        | HTTP API, WebSocket market data, auth, persistence, venue shell                                 | Fastify 5, @fastify/cookie, @fastify/websocket, pg, zod, pino |
| `packages/shared` | Matching engine, order book, validation, lifecycle deltas, pre-trade risk, depth diffs, schemas | TypeScript, zod; no I/O                                       |
| PostgreSQL        | Durable source of truth: command journal, orders, trades, balances, sessions, audit             | Native server (no containers)                                 |

## C4 level 3: components of `apps/api`

```mermaid
flowchart LR
  subgraph http[http/]
    hooks[session-hooks<br/>cookie -> request.auth, CSRF]
    err[error-handler + envelope]
    thr[login-throttle<br/>bounded-store, client-ip]
    rbac[auth-context<br/>requirePermission]
  end
  subgraph modules[modules/]
    auth[auth<br/>register, login, logout, me]
    orders[orders<br/>service + repository]
    ins[instruments<br/>list, book, trades]
    acc[accounts<br/>balances, reservations]
    md[marketdata.ws]
    pend[pending<br/>501 stubs]
    audit[audit repository]
    health[health]
  end
  subgraph venue[venue/]
    v[Venue<br/>serialize, install, publish]
    j[journal.repository]
    rec[recovery<br/>replay + reconcile]
  end
  core[[packages/shared<br/>applyCommand, checkPreTrade, orderDeltas,<br/>settlementDeltas, toDepth, diffDepth]]
  auth --> thr
  auth --> audit
  orders --> v
  orders --> j
  orders --> acc
  orders --> audit
  orders --> core
  ins --> v
  md --> v
  v --> core
  rec --> j
  rec --> core
```

## Module boundaries

- **`packages/shared` is the functional core** ([ADR-0003](../adr/0003-functional-core-imperative-shell.md)).
  Every function is pure: `applyCommand(spec, state, command) -> { state, events }`. It never reads the
  clock (timestamps travel inside commands), never generates ids (order ids arrive in the command), and
  never touches the database. This is what makes journal replay deterministic.
- **`apps/api/src/venue` is the imperative shell.** `Venue` owns exactly one mutable cell per instrument
  (the current `EngineState`), a promise chain that serializes commands per instrument
  ([ADR-0005](../adr/0005-single-writer-per-instrument.md)), and the market-data subscriber sets.
- **`apps/api/src/modules/<domain>`** each hold routes, an optional service, and repositories. Repositories
  take a `Queryable` so the same function runs on the pool or inside a transaction. Tenant scoping
  (`organization_id = $n`) is applied in repository functions, never left to callers.
- **`apps/web`** talks only to `/api/v1` and `/ws/market`. It imports pure helpers from `@tickbook/shared`
  (`applyDepthUpdates`, `formatMinor`, `parseMinor`, schema types) so client and server agree on depth
  reconstruction and money formatting.
- Cross-module calls inside the API go through exported functions only; no module reaches into another
  module's SQL.

## Request lifecycle: `POST /api/v1/orders`

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant F as Fastify hooks
  participant R as orders.routes
  participant S as orders.service
  participant V as Venue (per-symbol queue)
  participant C as shared core
  participant P as PostgreSQL
  participant W as WS subscribers
  B->>F: POST /api/v1/orders (tb_session cookie, x-csrf-token)
  F->>P: findSession(HMAC(token))
  F->>F: CSRF header == session.csrf_token (timing-safe)
  F->>R: request.auth set
  R->>R: requirePermission('orders:place'), zod placeOrderSchema
  R->>S: placeOrder(auth, input)
  S->>S: pendingOrderFeature? -> 501 TB-201..204
  S->>P: findAccount(org, accountId) (tenant check)
  S->>V: serialize(symbol, handler)
  V->>P: re-read account cash, position
  V->>C: checkPreTrade(book, reservations, limits)
  alt risk violation
    V->>P: tx: insert rejected order + audit (no journal entry)
    S-->>B: 422 RISK_REJECTED
  else pass
    V->>C: applyCommand(spec, state, place)
    V->>P: tx: journal(seq) + order row + order deltas + trades + settlement + audit
    V->>V: install(next state)
    V->>W: trade messages + depth diff (seq)
    S-->>B: 201 { order, trades (no counterparty ids) }
  end
```

Failure in the transaction rolls back and the venue keeps the previous state reference
([ADR-0010](../adr/0010-journal-then-install.md)); because the core is pure, "rollback" of the engine is
simply not assigning the new state.

Every request carries a request id (`x-request-id`, accepted from the client if it matches
`[A-Za-z0-9._-]{8,64}`, otherwise a UUID) that appears in logs and in `audit_log.request_id`. Errors
leave as the envelope `{ data: null, error: { code, message, details? } }`.

## Tenancy model

| Concept               | Scope                                                                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organization          | A participant firm (tenant). Users join via `memberships` with a role (`owner`, `trader`, `viewer`).                                                                          |
| Instruments and books | **Venue-wide.** All firms trade in the same books; that is the point of an exchange.                                                                                          |
| Accounts, positions   | Organization-scoped (`accounts.organization_id`). Looked up with `id AND organization_id`.                                                                                    |
| Orders                | Organization-scoped for reads and cancels; a foreign order id answers 404, not 403.                                                                                           |
| Trades                | Public tape shows price, size, aggressor side and time only. Execution reports show the caller's own fills; **counterparty firm, account and order ids are never disclosed**. |
| Market data           | Aggregated L2 (price, quantity, order count) — no order identities.                                                                                                           |

Venue operators (cross-firm surveillance, instrument admin) are a separate role family planned in
TB-504 and will not reuse firm roles.

## Deployment shape

One API process per venue today (the in-memory engine and in-process throttle are single-instance
by design; see [ADR-0013](../adr/0013-in-process-login-throttling.md) and TB-608 for the hot-standby
plan), behind nginx terminating TLS, with a native PostgreSQL. See
[../operations/deployment.md](../operations/deployment.md).
