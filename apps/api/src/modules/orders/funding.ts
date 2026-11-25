import {
  applyCommand,
  findOrder as findResting,
  type CancelCommand,
  type EngineEvent,
  type EngineState,
  type InstrumentSpec,
  type PlaceCommand,
  type RestingOrder,
  type TradeEvent,
} from '@tickbook/shared';
import type { Queryable } from '../../db/pool.js';
import { fundsOf, positionsOf } from '../accounts/accounts.repository.js';

/** A venue-initiated cancel of a resting maker that could not settle. */
export interface SystemCancel {
  readonly command: CancelCommand;
  readonly seq: number;
  readonly events: readonly EngineEvent[];
  readonly resting: RestingOrder;
}

export interface FundedPlan {
  /** Engine state after the system cancels, immediately before the place command. */
  readonly state: EngineState;
  readonly cancels: readonly SystemCancel[];
}

const MAX_ROUNDS = 100;

interface Need {
  cash: number;
  qty: number;
  buyMakers: Set<string>;
  sellMakers: Set<string>;
}

const makerNeeds = (trades: readonly TradeEvent[]): Map<string, Need> => {
  const needs = new Map<string, Need>();
  for (const t of trades) {
    const n = needs.get(t.makerAccountId) ?? {
      cash: 0,
      qty: 0,
      buyMakers: new Set(),
      sellMakers: new Set(),
    };
    if (t.aggressorSide === 'sell') {
      n.cash += t.price * t.quantity;
      n.buyMakers.add(t.makerOrderId);
    } else {
      n.qty += t.quantity;
      n.sellMakers.add(t.makerOrderId);
    }
    needs.set(t.makerAccountId, n);
  }
  return needs;
};

/** Maker order ids whose accounts cannot cover what the dry-run says they would trade. */
const unfundedMakers = async (
  db: Queryable,
  instrumentId: string,
  trades: readonly TradeEvent[],
): Promise<string[]> => {
  const needs = makerNeeds(trades);
  if (needs.size === 0) return [];
  const ids = [...needs.keys()];
  const funds = await fundsOf(db, ids);
  const positions = await positionsOf(db, instrumentId, ids);
  const out: string[] = [];
  for (const [accountId, n] of needs) {
    const f = funds.get(accountId);
    const coverable = f ? Math.min(f.cashMinor, f.reservedCashMinor) : 0;
    if (n.cash > coverable) out.push(...n.buyMakers);
    if (n.qty > (positions.get(accountId) ?? 0)) out.push(...n.sellMakers);
  }
  return out;
};

/**
 * Dry-runs the incoming order against the book. Any resting maker whose account
 * can no longer settle (cash for buys, position for sells) is cancelled with
 * reason `insufficient_funds` (a journaled engine command) and the dry run is
 * repeated, so an unfillable order never blocks the book or fails settlement.
 * Pure engine calls plus reads; nothing is written here.
 */
export const planWithFundedMakers = async (
  db: Queryable,
  spec: InstrumentSpec,
  instrumentId: string,
  start: EngineState,
  place: PlaceCommand,
): Promise<FundedPlan> => {
  let state = start;
  const cancels: SystemCancel[] = [];
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const preview = applyCommand(spec, state, place);
    const trades = preview.events.filter((e): e is TradeEvent => e.type === 'trade');
    const unfunded = await unfundedMakers(db, instrumentId, trades);
    if (unfunded.length === 0) return { state, cancels };
    for (const orderId of unfunded) {
      const loc = findResting(state.book, orderId);
      if (!loc) continue;
      const command: CancelCommand = {
        kind: 'cancel',
        orderId,
        accountId: loc.order.accountId,
        ts: place.ts,
        reason: 'insufficient_funds',
      };
      const result = applyCommand(spec, state, command);
      state = result.state;
      cancels.push({ command, seq: state.seq, events: result.events, resting: loc.order });
    }
  }
  throw new Error('Funding check did not converge');
};
