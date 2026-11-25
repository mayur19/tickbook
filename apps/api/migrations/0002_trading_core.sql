-- First vertical slice: instruments, trading accounts, positions, orders, trades
-- and the per-instrument command journal used for deterministic recovery.

CREATE TABLE instruments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol           text NOT NULL UNIQUE CHECK (symbol ~ '^[A-Z0-9.]{1,12}$'),
  name             text NOT NULL,
  currency         char(3) NOT NULL DEFAULT 'USD',
  tick_size        bigint NOT NULL CHECK (tick_size > 0),
  lot_size         bigint NOT NULL CHECK (lot_size > 0),
  max_order_qty    bigint NOT NULL CHECK (max_order_qty > 0),
  reference_price  bigint NOT NULL CHECK (reference_price > 0),
  price_band_bps   integer NOT NULL DEFAULT 1000 CHECK (price_band_bps BETWEEN 1 AND 100000),
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'halted', 'closed')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name                 text NOT NULL,
  currency             char(3) NOT NULL DEFAULT 'USD',
  cash_minor           bigint NOT NULL DEFAULT 0,
  max_order_notional   bigint NOT NULL DEFAULT 50000000 CHECK (max_order_notional > 0),
  max_position         bigint NOT NULL DEFAULT 100000 CHECK (max_position > 0),
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name),
  CONSTRAINT accounts_cash_non_negative CHECK (cash_minor >= 0)
);
CREATE INDEX accounts_org_idx ON accounts (organization_id);

CREATE TABLE positions (
  account_id     uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  instrument_id  uuid NOT NULL REFERENCES instruments (id),
  quantity       bigint NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, instrument_id)
);

-- Ordered, append-only input log per instrument. Replaying it through the pure
-- engine rebuilds the order book exactly (ADR-0004).
CREATE TABLE journal (
  instrument_id  uuid NOT NULL REFERENCES instruments (id),
  seq            bigint NOT NULL CHECK (seq > 0),
  command        jsonb NOT NULL,
  recorded_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (instrument_id, seq)
);

CREATE TABLE orders (
  id                  uuid PRIMARY KEY,
  organization_id     uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  account_id          uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  instrument_id       uuid NOT NULL REFERENCES instruments (id),
  client_order_id     text,
  side                text NOT NULL CHECK (side IN ('buy', 'sell')),
  type                text NOT NULL CHECK (type IN ('limit', 'market')),
  time_in_force       text NOT NULL CHECK (time_in_force IN ('GTC', 'IOC', 'FOK')),
  price               bigint CHECK (price > 0),
  quantity            bigint NOT NULL CHECK (quantity > 0),
  filled_quantity     bigint NOT NULL DEFAULT 0 CHECK (filled_quantity >= 0),
  filled_notional     bigint NOT NULL DEFAULT 0 CHECK (filled_notional >= 0),
  remaining_quantity  bigint NOT NULL CHECK (remaining_quantity >= 0),
  status              text NOT NULL CHECK (status IN ('new', 'partially_filled', 'filled', 'cancelled', 'rejected')),
  reject_reason       text,
  cancel_reason       text,
  journal_seq         bigint,
  created_by          uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_fill_bound CHECK (filled_quantity + remaining_quantity <= quantity),
  CONSTRAINT orders_limit_price CHECK ((type = 'limit') = (price IS NOT NULL))
);
CREATE UNIQUE INDEX orders_client_id_key ON orders (account_id, client_order_id) WHERE client_order_id IS NOT NULL;
CREATE INDEX orders_org_created_idx ON orders (organization_id, created_at DESC);
CREATE INDEX orders_open_idx ON orders (instrument_id, status) WHERE status IN ('new', 'partially_filled');

CREATE TABLE trades (
  instrument_id     uuid NOT NULL REFERENCES instruments (id),
  trade_id          bigint NOT NULL,
  price             bigint NOT NULL CHECK (price > 0),
  quantity          bigint NOT NULL CHECK (quantity > 0),
  aggressor_side    text NOT NULL CHECK (aggressor_side IN ('buy', 'sell')),
  maker_order_id    uuid NOT NULL REFERENCES orders (id),
  taker_order_id    uuid NOT NULL REFERENCES orders (id),
  maker_account_id  uuid NOT NULL REFERENCES accounts (id),
  taker_account_id  uuid NOT NULL REFERENCES accounts (id),
  journal_seq       bigint NOT NULL,
  executed_at       timestamptz NOT NULL,
  PRIMARY KEY (instrument_id, trade_id)
);
CREATE INDEX trades_instrument_time_idx ON trades (instrument_id, executed_at DESC);
CREATE INDEX trades_maker_account_idx ON trades (maker_account_id);
CREATE INDEX trades_taker_account_idx ON trades (taker_account_id);
