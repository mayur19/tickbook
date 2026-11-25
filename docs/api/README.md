# Tickbook API

The full contract is [openapi.yaml](openapi.yaml) (OpenAPI 3.1). Every operation is tagged
`x-status: implemented` or `x-status: pending`; pending operations are already routed and answer
`501 NOT_IMPLEMENTED` with their backlog ticket so the surface matches the spec today.

> Tickbook is a **simulated venue**. Balances are paper money, instruments are fictional and there
> is no connection to any real market or broker.

## Conventions

| Topic        | Rule                                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------- |
| Base URL     | `http://127.0.0.1:4106` in development (the web dev server proxies `/api` and `/ws` from port 5106) |
| Versioning   | Path prefix `/api/v1`. Breaking changes require `/api/v2`; additive fields are allowed in v1        |
| Content type | `application/json` request and response bodies; body limit 64 KiB                                   |
| Money        | Integer **minor units** (cents): `price: 10005` means 100.05. Never floats                          |
| Quantities   | Integer instrument units; must be a multiple of the instrument `lotSize`                            |
| Prices       | Must be a multiple of the instrument `tickSize`                                                     |
| Timestamps   | ISO 8601 UTC strings                                                                                |
| IDs          | UUIDs for orders, accounts, users, organizations; integers for `tradeId` and journal `seq`          |
| Request IDs  | Send `X-Request-Id` (8-64 chars of `[A-Za-z0-9._-]`) or the server assigns one; always echoed back  |
| Tenancy      | Accounts and orders are scoped to the caller's organization; other firms' resources answer `404`    |

## Envelope

Every JSON response has the same shape:

```json
{ "data": { "...": "..." }, "error": null, "meta": { "count": 3 } }
{ "data": null, "error": { "code": "RISK_REJECTED", "message": "Order failed pre-trade risk checks", "details": { "orderId": "…", "violations": ["insufficient_buying_power"] } } }
```

`meta` appears on list endpoints. `details` is optional and machine-readable.

## Error codes

| HTTP | Code                        | When                                                                                    |
| ---- | --------------------------- | --------------------------------------------------------------------------------------- |
| 400  | `VALIDATION_FAILED`         | Body/query/path failed schema validation; `details.issues[]` lists `path` and `message` |
| 400  | `INVALID_JSON`              | Body is not parseable JSON                                                              |
| 401  | `UNAUTHENTICATED`           | No valid session cookie                                                                 |
| 401  | `INVALID_CREDENTIALS`       | Login failed (same answer for unknown email and wrong password)                         |
| 403  | `FORBIDDEN`                 | Role lacks the permission (e.g. a viewer placing orders)                                |
| 403  | `CSRF_FAILED`               | Mutating request with a session but missing/wrong `X-CSRF-Token`                        |
| 404  | `NOT_FOUND`                 | Unknown route, instrument, order or account (including another firm's)                  |
| 409  | `ORDER_NOT_OPEN`            | Cancelling an order that is filled, cancelled or rejected                               |
| 409  | `DUPLICATE_CLIENT_ORDER_ID` | `clientOrderId` already used on this account                                            |
| 409  | `SETTLEMENT_CONFLICT`       | Concurrent settlement conflict (e.g. Postgres deadlock `40P01`); nothing applied, retry |
| 409  | `INSTRUMENT_NOT_OPEN`       | Instrument is halted or closed                                                          |
| 422  | `PRICE_REQUIRED`            | Limit order without `price`                                                             |
| 422  | `ORDER_REJECTED`            | Engine rule violation (tick/lot/max qty); order persisted as rejected and journaled     |
| 422  | `RISK_REJECTED`             | Pre-trade risk failed; `details.violations` lists every rule; persisted, not journaled  |
| 429  | `RATE_LIMITED`              | Login or registration throttled; honour `Retry-After`                                   |
| 501  | `NOT_IMPLEMENTED`           | Planned feature; `details.ticket` is the backlog ticket (e.g. `TB-401`)                 |
| 503  | `NOT_READY`                 | `/ready` cannot reach the database                                                      |
| 500  | `INTERNAL`                  | Unexpected failure (logged with the request ID; no internals in the body)               |

Risk violation values: `price_band_exceeded`, `notional_above_max`, `insufficient_buying_power`,
`insufficient_position`, `position_limit_exceeded`. Engine reject reasons: `invalid_quantity`,
`quantity_not_lot_multiple`, `quantity_above_max`, `price_required`, `price_not_allowed`,
`invalid_price`, `price_not_tick_multiple`, `invalid_tif_for_market`, `duplicate_order_id`.

## Pagination and limits

The slice uses bounded `limit` parameters rather than cursors: `GET /api/v1/orders?limit=` (1-200,
default 50), `GET /instruments/{symbol}/trades?limit=` (1-500, default 50) and
`GET /instruments/{symbol}/book?depth=` (1-50, default 10). Cursor pagination for historical trades
is planned (TB-408).

## Authentication, sessions and CSRF

1. `POST /api/v1/auth/login` with email and password. The response sets two cookies:
   `tb_session` (HttpOnly, SameSite=Lax, Secure in production) and `tb_csrf` (readable by the SPA).
   The body also returns `csrfToken`.
2. Send the cookies on every request. Session tokens are stored only as HMAC-SHA256 hashes.
3. Every `POST`/`PUT`/`PATCH`/`DELETE` made with a session must send `X-CSRF-Token: <csrfToken>`
   (double-submit; compared in constant time against the session's token).
4. `POST /api/v1/auth/logout` deletes the session row and clears both cookies.

Roles: `owner` (everything), `trader` (place/cancel/read orders, accounts, market data),
`viewer` (read-only).

Registration (`POST /api/v1/auth/register`) always answers `202` with a generic message and does not
sign the user in, so it cannot reveal whether an email already exists. Sign in afterwards.

## Rate limits

| Limit                               | Default                                      | Config                         |
| ----------------------------------- | -------------------------------------------- | ------------------------------ |
| Login attempts per client IP        | 30 / minute                                  | `LOGIN_RATE_LIMIT_PER_MINUTE`  |
| Distinct emails tried per client IP | 10 / minute                                  | built in                       |
| Failed logins per email             | 5 free, then 1s, 2s, 4s ... capped at 15 min | built in                       |
| Registrations per client IP         | 5 / hour                                     | `REGISTER_RATE_LIMIT_PER_HOUR` |

Client IPs are normalised (IPv4-mapped IPv6 becomes IPv4; other IPv6 addresses collapse to their
/64). Behind a reverse proxy set `TRUST_PROXY` so the real client address is used. Per-account order
rate limits are planned (TB-321).

## Market-data WebSocket

`ws://127.0.0.1:4106/ws/market?symbol=TBK` (session cookie required). The server sends a
`snapshot`, then `depth` (incremental level changes, `quantity: 0` removes a level) and `trade`
messages, each with the engine `seq`. Send the text frame `snapshot` to resynchronise. Close codes:
`4401` unauthenticated, `4404` unknown symbol, `1013` consumer too slow.

```json
{"type":"snapshot","symbol":"TBK","seq":19,"bids":[{"price":9995,"quantity":70,"orders":1}],"asks":[{"price":10005,"quantity":20,"orders":1}]}
{"type":"trade","symbol":"TBK","seq":20,"tradeId":3,"price":10005,"quantity":20,"aggressorSide":"buy","ts":"2026-11-25T04:52:52.569Z"}
{"type":"depth","symbol":"TBK","seq":20,"updates":[{"side":"sell","price":10005,"quantity":0,"orders":0}]}
```

## curl examples

```bash
B=http://127.0.0.1:4106
# Sign in and keep cookies in a jar
curl -s -c jar.txt -H 'content-type: application/json' \
  -d '{"email":"demo@tickbook.local","password":"tickbook-demo-pass"}' $B/api/v1/auth/login
CSRF=$(awk '/tb_csrf/ {print $7}' jar.txt)

# Accounts (cash, reserved cash, positions)
curl -s -b jar.txt $B/api/v1/accounts
ACC=$(curl -s -b jar.txt $B/api/v1/accounts | node -pe 'JSON.parse(require("fs").readFileSync(0)).data[0].id')

# Level-2 book and recent trades
curl -s -b jar.txt "$B/api/v1/instruments/TBK/book?depth=5"
curl -s -b jar.txt "$B/api/v1/instruments/TBK/trades?limit=10"

# Place a resting limit buy at 99.50 (prices are minor units)
curl -s -b jar.txt -H "x-csrf-token: $CSRF" -H 'content-type: application/json' \
  -d "{\"accountId\":\"$ACC\",\"symbol\":\"TBK\",\"side\":\"buy\",\"type\":\"limit\",\"price\":9950,\"quantity\":10,\"timeInForce\":\"GTC\"}" \
  $B/api/v1/orders

# Marketable IOC: executions come back in data.trades (no counterparty identities)
curl -s -b jar.txt -H "x-csrf-token: $CSRF" -H 'content-type: application/json' \
  -d "{\"accountId\":\"$ACC\",\"symbol\":\"TBK\",\"side\":\"buy\",\"type\":\"market\",\"quantity\":10,\"timeInForce\":\"IOC\"}" \
  $B/api/v1/orders

# Cancel
curl -s -b jar.txt -H "x-csrf-token: $CSRF" -X DELETE $B/api/v1/orders/<order-id>

# A pending endpoint
curl -s -b jar.txt $B/api/v1/instruments/TBK/candles
# {"data":null,"error":{"code":"NOT_IMPLEMENTED","message":"OHLCV candles is not implemented yet","details":{"ticket":"TB-401"}}}
```
