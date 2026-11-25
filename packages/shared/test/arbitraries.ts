import fc from 'fast-check';
import type { EngineCommand } from '../src/index.js';

const ACCOUNTS = ['acct-a', 'acct-b', 'acct-c'];

/**
 * Random command streams over a narrow price band so orders cross often.
 * Includes a small share of invalid orders (bad tick/lot) and cancels of
 * earlier ids (some already filled, some foreign) to exercise every branch.
 */
export const commandStream = (maxLength = 120): fc.Arbitrary<EngineCommand[]> =>
  fc
    .array(
      fc.record({
        kind: fc.constantFrom('place', 'place', 'place', 'place', 'cancel'),
        side: fc.constantFrom('buy' as const, 'sell' as const),
        type: fc.constantFrom(
          'limit' as const,
          'limit' as const,
          'limit' as const,
          'market' as const,
        ),
        tif: fc.constantFrom('GTC' as const, 'GTC' as const, 'IOC' as const, 'FOK' as const),
        priceTicks: fc.integer({ min: 18, max: 22 }),
        offTick: fc.integer({ min: 0, max: 19 }).map((n) => n === 0),
        lots: fc.integer({ min: 1, max: 12 }),
        account: fc.constantFrom(...ACCOUNTS),
        cancelTarget: fc.nat(),
      }),
      { maxLength },
    )
    .map((raw) =>
      raw.map((r, i): EngineCommand => {
        if (r.kind === 'cancel' && i > 0) {
          return {
            kind: 'cancel',
            orderId: `o${r.cancelTarget % i}`,
            accountId: r.account,
            ts: '2026-01-01T00:00:00.000Z',
          };
        }
        const price = r.priceTicks * 5 + (r.offTick ? 1 : 0);
        return {
          kind: 'place',
          ts: '2026-01-01T00:00:00.000Z',
          order: {
            orderId: `o${i}`,
            accountId: r.account,
            side: r.side,
            type: r.type,
            tif: r.type === 'market' && r.tif === 'GTC' ? 'IOC' : r.tif,
            ...(r.type === 'limit' ? { price } : {}),
            quantity: r.lots * 10,
          },
        };
      }),
    );
