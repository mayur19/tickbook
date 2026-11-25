# Data model

Full target schema of the simulated venue. Only the tables in migrations `0001_foundation.sql`
and `0002_trading_core.sql` exist today; the rest are planned and listed with the migration and
ticket that will introduce them. Conventions: `uuid` primary keys (`gen_random_uuid()`), money and
quantities as `bigint` integer minor units ([ADR-0006](../adr/0006-integer-minor-units.md)),
timestamps `timestamptz` in UTC, tenant tables carry `organization_id` and are always queried with it.

## Target ERD

```mermaid
erDiagram
  organizations ||--o{ memberships : has
  users ||--o{ memberships : joins
  users ||--o{ sessions : opens
  organizations ||--o{ sessions : scopes
  organizations ||--o{ audit_log : records
  organizations ||--o{ accounts : owns
  accounts ||--o{ positions : holds
  instruments ||--o{ positions : of
  instruments ||--o{ journal : sequences
  accounts ||--o{ orders : places
  instruments ||--o{ orders : for
  orders ||--o{ trades : "maker / taker"
  instruments ||--o{ trades : prints

  organizations ||--o{ invitations : issues
  organizations ||--o{ api_keys : issues
  organizations ||--o{ outbox : notifies
  accounts ||--|| risk_limits : constrained_by
  accounts ||--o{ ledger_accounts : maps
  ledger_journals ||--|{ ledger_postings : contains
  ledger_accounts ||--o{ ledger_postings : posts
  trades ||--o| ledger_journals : settles
  fee_schedules ||--|{ fee_tiers : has
  organizations }o--|| fee_schedules : billed_by
  instruments ||--o{ tick_size_bands : priced_by
  instruments ||--o{ candles : aggregates
  instruments ||--o{ trading_sessions : scheduled
  instruments ||--o{ halts : halted_by
  instruments ||--o{ auctions : uncrossed_by
  instruments ||--o{ engine_snapshots : snapshotted
  organizations ||--o{ surveillance_alerts : subject_of

  organizations { uuid id PK; text name; timestamptz created_at }
  users { uuid id PK; text email UK; text display_name; text password_hash; timestamptz last_login_at }
  memberships { uuid organization_id PK,FK; uuid user_id PK,FK; text role }
  sessions { uuid id PK; text token_hash UK; uuid user_id FK; uuid organization_id FK; text csrf_token; timestamptz expires_at }
  audit_log { bigserial id PK; uuid organization_id FK; uuid actor_user_id FK; text action; text entity_type; text entity_id; jsonb metadata; text request_id }
  instruments { uuid id PK; text symbol UK; bigint tick_size; bigint lot_size; bigint max_order_qty; bigint reference_price; int price_band_bps; text status }
  accounts { uuid id PK; uuid organization_id FK; text name; bigint cash_minor; bigint max_order_notional; bigint max_position }
  positions { uuid account_id PK,FK; uuid instrument_id PK,FK; bigint quantity }
  journal { uuid instrument_id PK,FK; bigint seq PK; jsonb command; timestamptz recorded_at }
  orders { uuid id PK; uuid organization_id FK; uuid account_id FK; uuid instrument_id FK; text side; text type; text time_in_force; bigint price; bigint quantity; bigint filled_quantity; bigint filled_notional; bigint remaining_quantity; text status; bigint journal_seq }
  trades { uuid instrument_id PK,FK; bigint trade_id PK; bigint price; bigint quantity; text aggressor_side; uuid maker_order_id FK; uuid taker_order_id FK; bigint journal_seq; timestamptz executed_at }

  invitations { uuid id PK; uuid organization_id FK; text email; text role; text token_hash; timestamptz expires_at }
  api_keys { uuid id PK; uuid organization_id FK; text key_id UK; text secret_hash; text[] scopes; timestamptz revoked_at }
  outbox { bigserial id PK; uuid organization_id FK; text channel; text recipient; jsonb payload; timestamptz delivered_at }
  risk_limits { uuid account_id PK,FK; bigint max_order_notional; bigint max_position; int max_open_orders; bigint max_daily_loss; int max_msgs_per_sec }
  ledger_accounts { uuid id PK; uuid account_id FK; text kind; text currency; uuid instrument_id FK }
  ledger_journals { uuid id PK; text kind; uuid instrument_id; bigint trade_id; timestamptz posted_at }
  ledger_postings { bigserial id PK; uuid journal_id FK; uuid ledger_account_id FK; bigint amount }
  fee_schedules { uuid id PK; text name; date effective_from }
  fee_tiers { uuid schedule_id PK,FK; bigint min_monthly_volume PK; int maker_bps; int taker_bps }
  tick_size_bands { uuid instrument_id PK,FK; bigint from_price PK; bigint tick_size }
  candles { uuid instrument_id PK,FK; text interval PK; timestamptz bucket_start PK; bigint open; bigint high; bigint low; bigint close; bigint volume; bigint notional }
  trading_sessions { uuid id PK; uuid instrument_id FK; date trade_date; text phase; timestamptz starts_at; timestamptz ends_at }
  halts { uuid id PK; uuid instrument_id FK; text reason; bigint journal_seq; timestamptz started_at; timestamptz ended_at }
  auctions { uuid id PK; uuid instrument_id FK; text kind; bigint uncross_price; bigint volume; bigint imbalance; bigint journal_seq }
  engine_snapshots { uuid instrument_id PK,FK; bigint seq PK; jsonb state; text engine_version; text sha256 }
  surveillance_alerts { uuid id PK; uuid organization_id FK; uuid instrument_id FK; text rule; text status; jsonb evidence }
```

## Existing tables

### Migration `0001_foundation.sql` (TB-004, TB-008, TB-010)

| Table           | Notes                                                                                                                                                                        | Indexes / constraints                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `organizations` | Participant firms (tenants). Name 2–120 chars.                                                                                                                               | PK                                                             |
| `users`         | Login identities. Email stored lowercase (CHECK). `password_hash` is `scrypt$N$r$p$salt$hash`.                                                                               | `users_email_key` unique                                       |
| `memberships`   | User ↔ organization with role `owner`/`trader`/`viewer`. Login picks the earliest membership.                                                                                | PK `(organization_id, user_id)`, `memberships_user_idx`        |
| `sessions`      | Server-side sessions. Only `HMAC-SHA256(token, SESSION_SECRET)` is stored; `csrf_token` for the double-submit check; `ip` and `user_agent` kept for review.                  | `token_hash` unique, `sessions_expires_idx` (cleanup TB-957)   |
| `audit_log`     | Append-only actions (`auth.login`, `auth.login_failed`, `organization.registered`, `order.placed`, `order.cancelled`, `order.risk_rejected`, ...). No secrets in `metadata`. | `audit_log_org_created_idx (organization_id, created_at DESC)` |

### Migration `0002_trading_core.sql` (TB-105, TB-107, TB-109)

| Table         | Notes                                                                                                                                                                                                     | Indexes / constraints                                                                                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `instruments` | Venue-wide listing: tick size, lot size, max order quantity, reference price (fat-finger anchor until the first trade), price band in bps, status `open`/`halted`/`closed`.                               | `symbol` unique with `^[A-Z0-9.]{1,12}$` CHECK; positive tick/lot                                                                                                                                      |
| `accounts`    | Firm trading accounts with simulated cash and interim risk limits (moving to `risk_limits`, TB-320).                                                                                                      | `UNIQUE (organization_id, name)`, `accounts_cash_non_negative` and `accounts_reserved_bounds` CHECKs; `reserved_cash_minor` = Σ price × remaining of resting buys (0003), `accounts_org_idx`           |
| `positions`   | Quantity per account and instrument. Long-only today.                                                                                                                                                     | PK `(account_id, instrument_id)`, `quantity >= 0`                                                                                                                                                      |
| `journal`     | Ordered engine inputs per instrument ([ADR-0004](../adr/0004-command-journal-replay.md)). `command` is the exact `EngineCommand` JSON (place with order id and timestamp, or cancel). Dense `seq` from 1. | PK `(instrument_id, seq)` gives ordering and gap detection                                                                                                                                             |
| `orders`      | Order state projection updated by engine deltas in the same transaction. Risk-rejected orders have `journal_seq` NULL.                                                                                    | `orders_client_id_key` partial unique `(account_id, client_order_id)`; `orders_org_created_idx`; `orders_open_idx` partial on open statuses; `orders_fill_bound`; `orders_limit_price` (limit ⇔ price) |
| `trades`      | One row per fill with maker and taker ids for internal use; public endpoints expose only price, quantity, aggressor and time.                                                                             | PK `(instrument_id, trade_id)`; `trades_instrument_time_idx`; maker/taker account indexes                                                                                                              |

`schema_migrations(version, name, checksum, applied_at)` is created by the runner itself.

## Planned tables

| Migration (planned)    | Tables                                                  | Ticket(s)              | Notes                                                                                 |
| ---------------------- | ------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| `0003_outbox_identity` | `outbox`, `invitations`, `email_verifications`          | TB-814, TB-801, TB-812 | Local delivery only; a dev viewer reads `outbox`                                      |
| `0004_api_keys`        | `api_keys`                                              | TB-810                 | `secret_hash` only; HMAC request signing; scopes such as `orders:place`               |
| `0005_login_throttle`  | `login_throttle` (key, counters, locked_until)          | TB-813                 | Moves in-process counters to Postgres for multi-instance                              |
| `0006_ledger`          | `ledger_accounts`, `ledger_journals`, `ledger_postings` | TB-301, TB-302         | Deferred constraint trigger: postings per journal sum to zero per currency/instrument |
| `0007_fees`            | `fee_schedules`, `fee_tiers`, org fee assignment        | TB-310, TB-311         | Effective-dated; fees posted as ledger journals per fill                              |
| `0008_risk_limits`     | `risk_limits`                                           | TB-320, TB-321, TB-322 | Replaces limit columns on `accounts`                                                  |
| `0009_market_data`     | `candles`                                               | TB-401                 | Rollups per interval; PK `(instrument_id, interval, bucket_start)`                    |
| `0010_venue_ops`       | `tick_size_bands`, `trading_sessions`, `halts`          | TB-503, TB-505, TB-510 | Halts and session changes also appear as journal commands                             |
| `0011_auctions`        | `auctions`                                              | TB-520..TB-523         | Records uncrossing price, volume, imbalance and the journal seq of the uncross        |
| `0012_snapshots`       | `engine_snapshots`                                      | TB-602, TB-612         | Serialized `EngineState` at a seq with engine version and checksum                    |
| `0013_journal_hash`    | `journal.prev_hash`, `journal.hash` columns             | TB-605                 | Hash chain for tamper evidence                                                        |
| `0014_surveillance`    | `surveillance_alerts`, `alert_notes`                    | TB-701..TB-705         | Venue-operator scope (not firm-scoped reads)                                          |
| `0015_partitioning`    | Partition `journal` and `trades` by month               | TB-609                 | Archive old partitions                                                                |

## Query patterns and indexes

| Query                       | Path                                                  |
| --------------------------- | ----------------------------------------------------- |
| Resolve session per request | `sessions.token_hash` unique index + joins on PKs     |
| Replay at boot              | `journal` PK range scan per instrument                |
| Reconcile open orders       | `orders_open_idx` partial index                       |
| Blotter (`GET /orders`)     | `orders_org_created_idx` ordered by `created_at DESC` |
| Trades tape                 | PK `(instrument_id, trade_id)` descending             |
| Last price at boot          | PK descending, `LIMIT 1`                              |
| Account positions           | `positions` PK with `account_id = ANY($1)`            |
