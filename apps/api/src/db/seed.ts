import type { Role } from '@tickbook/shared';
import type { AuthContext } from '../http/auth-context.js';
import { createAccount, setPosition } from '../modules/accounts/accounts.repository.js';
import {
  insertMembership,
  insertOrganization,
  insertUser,
} from '../modules/auth/user.repository.js';
import { insertInstrument } from '../modules/instruments/instruments.repository.js';
import { placeOrder } from '../modules/orders/orders.service.js';
import { hashPassword } from '../security/password.js';
import { recoverVenue } from '../venue/recovery.js';
import type { Venue } from '../venue/venue.js';
import type { Pool } from './pool.js';
import { DEMO_PASSWORD, FIRMS, INSTRUMENTS } from './seed-data.js';

interface SeededFirm {
  readonly auth: AuthContext;
  readonly accountId: string;
}

const seedFirm = async (
  pool: Pool,
  firm: (typeof FIRMS)[number],
  passwordHash: string,
  instrumentIds: Map<string, string>,
): Promise<SeededFirm> => {
  const orgId = await insertOrganization(pool, firm.name);
  let owner: AuthContext | null = null;
  for (const u of firm.users) {
    const userId = await insertUser(pool, {
      email: u.email,
      displayName: u.displayName,
      passwordHash,
    });
    await insertMembership(pool, orgId, userId, u.role as Role);
    owner ??= {
      sessionId: 'seed',
      userId,
      email: u.email,
      displayName: u.displayName,
      organizationId: orgId,
      organizationName: firm.name,
      role: u.role,
      csrfToken: 'seed',
    };
  }
  const accountId = await createAccount(pool, {
    organizationId: orgId,
    name: firm.account.name,
    cashMinor: firm.account.cashMinor,
  });
  await pool.query('UPDATE accounts SET max_position = $2, max_order_notional = $3 WHERE id = $1', [
    accountId,
    firm.account.maxPosition,
    firm.account.maxOrderNotional,
  ]);
  for (const [symbol, qty] of Object.entries(firm.positions)) {
    await setPosition(pool, accountId, instrumentIds.get(symbol) as string, qty);
  }
  return { auth: owner as AuthContext, accountId };
};

/** Deterministic resting ladder around the reference price, placed through the real order path. */
const seedLadder = async (venue: Venue, pool: Pool, mm: SeededFirm): Promise<void> => {
  for (const ins of INSTRUMENTS) {
    for (let level = 1; level <= 8; level += 1) {
      const offset = level * ins.tickSize * (ins.symbol === 'TBK' ? 5 : 2);
      const qty = ins.lotSize * (10 + ((level * 7) % 13)) * (ins.lotSize === 1 ? 10 : 1);
      for (const side of ['buy', 'sell'] as const) {
        const price = side === 'buy' ? ins.referencePrice - offset : ins.referencePrice + offset;
        await placeOrder(
          { pool, venue },
          mm.auth,
          {
            accountId: mm.accountId,
            symbol: ins.symbol,
            side,
            type: 'limit',
            timeInForce: 'GTC',
            price,
            quantity: qty,
          },
          'seed',
        );
      }
    }
  }
};

/** A few aggressive demo orders so the trades tape and positions are not empty. */
const seedActivity = async (venue: Venue, pool: Pool, demo: SeededFirm): Promise<void> => {
  const orders = [
    {
      symbol: 'TBK',
      side: 'buy' as const,
      type: 'market' as const,
      timeInForce: 'IOC' as const,
      quantity: 150,
    },
    {
      symbol: 'TBK',
      side: 'sell' as const,
      type: 'limit' as const,
      timeInForce: 'IOC' as const,
      price: 9_990,
      quantity: 100,
    },
    {
      symbol: 'ACME',
      side: 'buy' as const,
      type: 'limit' as const,
      timeInForce: 'FOK' as const,
      price: 5_260,
      quantity: 200,
    },
    {
      symbol: 'TBK',
      side: 'buy' as const,
      type: 'limit' as const,
      timeInForce: 'GTC' as const,
      price: 9_985,
      quantity: 50,
    },
  ];
  for (const o of orders)
    await placeOrder({ pool, venue }, demo.auth, { accountId: demo.accountId, ...o }, 'seed');
};

export const seed = async (pool: Pool): Promise<void> => {
  const instrumentIds = new Map<string, string>();
  for (const ins of INSTRUMENTS) instrumentIds.set(ins.symbol, await insertInstrument(pool, ins));
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const [mmFirm, demoFirm] = FIRMS;
  const mm = await seedFirm(pool, mmFirm, passwordHash, instrumentIds);
  const demo = await seedFirm(pool, demoFirm, passwordHash, instrumentIds);
  const { venue } = await recoverVenue(pool, 20);
  await seedLadder(venue, pool, mm);
  await seedActivity(venue, pool, demo);
};
