# Runbook

Operational reference for running Tickbook locally or on a single VM. Tickbook is a simulated venue;
"incidents" affect paper trading only, but the recovery procedures are written as if they were real.

## Configuration

All configuration comes from environment variables (loaded from `.env` by `run.sh` and the npm
scripts). The API validates them with zod at startup and refuses to start with a list of every problem.

| Variable                       | Default                               | Notes                                                                                                                              |
| ------------------------------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                     | `development`                         | `development`, `test` or `production`. Production enables Secure cookies and requires `TRUST_PROXY`                                |
| `API_HOST`                     | `127.0.0.1`                           | Bind address. Keep loopback behind nginx                                                                                           |
| `API_PORT`                     | `4106`                                |                                                                                                                                    |
| `WEB_PORT`                     | `5106`                                | Vite dev server port (development only)                                                                                            |
| `APP_ORIGIN`                   | `http://localhost:5106`               | Public origin of the web app                                                                                                       |
| `LOG_LEVEL`                    | `info`                                | pino level; cookies, authorization and CSRF headers are redacted                                                                   |
| `DATABASE_URL`                 | `postgres:///tickbook_dev?host=/tmp`  | Local socket, current OS user, no password                                                                                         |
| `TEST_DATABASE_URL`            | `postgres:///tickbook_test?host=/tmp` | Used by the API test suite; its schema is dropped on every run                                                                     |
| `SESSION_SECRET`               | random (written by `run.sh`)          | At least 32 characters; keys the HMAC of stored session tokens. Rotating it signs everyone out                                     |
| `SESSION_TTL_HOURS`            | `12`                                  | Session lifetime                                                                                                                   |
| `LOGIN_RATE_LIMIT_PER_MINUTE`  | `30`                                  | Login attempts per normalised client IP per minute across all emails                                                               |
| `REGISTER_RATE_LIMIT_PER_HOUR` | `5`                                   | Registrations per normalised client IP per hour                                                                                    |
| `TRUST_PROXY`                  | `false`                               | `false`, a hop count (`1`) or comma-separated proxy IPs/CIDRs (`127.0.0.1,10.0.0.0/8`). `true` is rejected. Required in production |
| `DEPTH_PUBLISH_LEVELS`         | `20`                                  | Levels per side in WebSocket snapshots and diffs                                                                                   |

Built-in throttle constants (in `apps/api/src/http/login-throttle.ts`): 5 free failures per email,
backoff 1s doubling to 15 minutes, 10 distinct emails per IP per minute, 10,000 keys per store.

## Everyday commands

```bash
./run.sh            # deps, .env with random secret, create DB, migrate, seed, start API + web
./run.sh setup      # everything except starting the servers
./run.sh migrate    # apply pending migrations
./run.sh seed       # seed demo data if the database has no users
./run.sh reset      # drop schema, migrate, seed (asks; --yes to skip; refuses in production)
./run.sh test       # unit + integration tests against tickbook_test
./run.sh check      # lint, format check, typecheck, tests (what CI runs)
./run.sh build      # production build of API and web
./run.sh e2e        # Playwright smoke tests
```

Production start after a build: `node --env-file=/etc/tickbook/tickbook.env apps/api/dist/index.js`
(see [deployment.md](deployment.md)). Migrations: `node apps/api/dist/db/cli.js migrate`.

## Startup sequence and what to watch

1. Config validation (fails fast).
2. Recovery: for each instrument the journal is read in sequence order and folded through the pure
   engine. Log line `order books recovered from journal` with `{symbol, commands, restingOrders}`.
   A sequence gap aborts startup with `Journal gap for <SYMBOL>`.
3. Reconciliation: replayed resting orders are compared with `orders` rows in `new` /
   `partially_filled`, and each account's `reserved_cash_minor` with the resting buys in the books. Any mismatch logs `journal and order table disagree` with details. Today this
   is a warning (TB-603 will block trading). **Treat it as an incident**: stop order entry, take a
   backup, investigate.
4. Listen on `API_HOST:API_PORT`. `/ready` returns 200 once the database is reachable.

## Backup

The journal, orders, trades, accounts and positions are written in the same transaction for every
command, so any consistent `pg_dump` snapshot is journal-consistent: replaying its journal rebuilds
exactly the books implied by its `orders` table.

```bash
pg_dump --format=custom --no-owner --file=/var/backups/tickbook/tickbook-$(date -u +%Y%m%dT%H%M%SZ).dump tickbook
chmod 600 /var/backups/tickbook/*.dump
```

Run it from cron at least hourly while the venue is in use; keep 7 daily and 4 weekly copies.

## Restore

```bash
sudo systemctl stop tickbook-api
dropdb tickbook && createdb tickbook
pg_restore --no-owner --dbname=tickbook /var/backups/tickbook/<file>.dump
node apps/api/dist/db/cli.js migrate      # applies any newer migrations; checksums verified
sudo systemctl start tickbook-api
journalctl -u tickbook-api -n 50          # confirm recovery report and no reconciliation warning
```

Trading activity after the backup is lost; firms see their orders and balances as of the snapshot.

## Troubleshooting

| Symptom                                           | Likely cause and action                                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Invalid configuration: ...` at start             | Fix the listed variables. In production, set `TRUST_PROXY` explicitly (`127.0.0.1` behind local nginx)                                     |
| `Cannot reach PostgreSQL` from `run.sh`           | Start the server: `brew services start postgresql@17` or `sudo systemctl start postgresql`; check the socket dir is `/tmp`                 |
| `Checksum mismatch for applied migration`         | Someone edited an applied migration. Revert the file; add a new forward migration instead                                                  |
| Orders cancelled with reason `insufficient_funds` | An account's cash or position was changed outside the order path; the venue cancelled resting orders it could no longer settle (journaled) |
| `Journal gap for SYMBOL`                          | Journal rows were deleted or a restore was partial. Restore from the last good backup; never renumber journal rows                         |
| `journal and order table disagree`                | Manual SQL edits or a bug. Stop trading, back up, compare with `node` replay; file an incident with the logged order IDs                   |
| Many `429 RATE_LIMITED` for one office            | All users share one NAT IP. Raise `LOGIN_RATE_LIMIT_PER_MINUTE`; check `TRUST_PROXY` so the proxy IP is not used for everyone              |
| Everyone shares the same rate-limit bucket        | `TRUST_PROXY` unset behind nginx, so every request appears to come from 127.0.0.1                                                          |
| `409 SETTLEMENT_CONFLICT`                         | Concurrent settlement conflict (Postgres deadlock `40P01` between touched accounts); nothing was applied, client should retry              |
| WebSocket closes with 1013                        | Client is not reading fast enough; it should reconnect and resnapshot                                                                      |
| WebSocket closes with 4401                        | Session expired or missing cookie (check nginx forwards cookies and the `Upgrade` headers)                                                 |
| Warning `throttle store full of active entries`   | Likely an attack generating many keys; check source IPs in logs; consider a firewall rule                                                  |
