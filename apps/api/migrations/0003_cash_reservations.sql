-- Durable buying-power reservations (ADR-0019).
-- reserved_cash_minor always equals the sum of price x remaining over the
-- account's resting buy orders. A buy order reserves its worst-case notional with
-- a conditional UPDATE before it may reach the matching engine, so orders on
-- different instruments can never commit the same cash twice.

ALTER TABLE accounts
  ADD COLUMN reserved_cash_minor bigint NOT NULL DEFAULT 0;

UPDATE accounts a
   SET reserved_cash_minor = r.reserved
  FROM (
    SELECT account_id, sum(price * remaining_quantity)::bigint AS reserved
      FROM orders
     WHERE side = 'buy' AND status IN ('new', 'partially_filled')
     GROUP BY account_id
  ) r
 WHERE r.account_id = a.id;

ALTER TABLE accounts
  ADD CONSTRAINT accounts_reserved_bounds
  CHECK (reserved_cash_minor >= 0 AND reserved_cash_minor <= cash_minor);
