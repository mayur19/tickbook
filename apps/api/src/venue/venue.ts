import {
  diffDepth,
  exposureOf,
  toDepth,
  type EngineEvent,
  type EngineState,
  type InstrumentSpec,
  type MarketMessage,
} from '@tickbook/shared';
import type { InstrumentRecord } from '../modules/instruments/instruments.repository.js';
import { KeyedMutex } from './keyed-mutex.js';

export type MarketListener = (message: MarketMessage) => void;

/** Read-only view of one instrument's engine handed to command handlers. */
export interface InstrumentView {
  readonly instrument: InstrumentRecord;
  readonly spec: InstrumentSpec;
  readonly state: EngineState;
  readonly lastPrice: number | null;
}

interface Runtime {
  readonly instrument: InstrumentRecord;
  readonly spec: InstrumentSpec;
  state: EngineState;
  lastPrice: number | null;
  tail: Promise<unknown>;
}

export const specOf = (i: InstrumentRecord): InstrumentSpec => ({
  symbol: i.symbol,
  tickSize: i.tickSize,
  lotSize: i.lotSize,
  maxOrderQty: i.maxOrderQty,
});

/**
 * The venue is the imperative shell around the pure engine (ADR-0003). It owns
 * exactly one mutable cell per instrument (the current EngineState) and a
 * promise chain that serializes every command for that instrument, giving the
 * single-writer guarantee the deterministic journal relies on.
 */
export class Venue {
  private readonly runtimes = new Map<string, Runtime>();
  private readonly listeners = new Map<string, Set<MarketListener>>();
  private readonly accountLocks = new KeyedMutex();

  constructor(private readonly depthLevels: number) {}

  register(instrument: InstrumentRecord, state: EngineState, lastPrice: number | null): void {
    this.runtimes.set(instrument.symbol, {
      instrument,
      spec: specOf(instrument),
      state,
      lastPrice,
      tail: Promise.resolve(),
    });
  }

  symbols(): string[] {
    return [...this.runtimes.keys()].sort();
  }

  view(symbol: string): InstrumentView | null {
    const rt = this.runtimes.get(symbol);
    return rt
      ? { instrument: rt.instrument, spec: rt.spec, state: rt.state, lastPrice: rt.lastPrice }
      : null;
  }

  /**
   * Runs `handler` with exclusive access to the instrument. The handler returns
   * the next state to install (or null to leave it untouched) after it has made
   * the corresponding journal entry durable.
   */
  serialize<T>(
    symbol: string,
    handler: (view: InstrumentView) => Promise<{
      next: EngineState | null;
      events: readonly EngineEvent[];
      ts: string;
      result: T;
    }>,
  ): Promise<T> {
    const rt = this.runtimes.get(symbol);
    if (!rt) return Promise.reject(new Error(`Unknown instrument ${symbol}`));
    const run = rt.tail.then(async () => {
      const { next, events, ts, result } = await handler({
        instrument: rt.instrument,
        spec: rt.spec,
        state: rt.state,
        lastPrice: rt.lastPrice,
      });
      if (next) this.install(rt, next, events, ts);
      return result;
    });
    rt.tail = run.catch(() => undefined);
    return run;
  }

  private install(
    rt: Runtime,
    next: EngineState,
    events: readonly EngineEvent[],
    ts: string,
  ): void {
    const before = toDepth(rt.state.book, this.depthLevels);
    rt.state = next;
    const symbol = rt.instrument.symbol;
    for (const e of events) {
      if (e.type !== 'trade') continue;
      rt.lastPrice = e.price;
      this.publish(symbol, {
        type: 'trade',
        symbol,
        seq: next.seq,
        tradeId: e.tradeId,
        price: e.price,
        quantity: e.quantity,
        aggressorSide: e.aggressorSide,
        ts,
      });
    }
    const updates = diffDepth(before, toDepth(next.book, this.depthLevels));
    if (updates.length > 0) this.publish(symbol, { type: 'depth', symbol, seq: next.seq, updates });
  }

  /**
   * Runs `fn` holding the account's reservation lock. Call only from inside
   * `serialize` (instrument first, then account; never the reverse).
   */
  withAccountLock<T>(accountId: string, fn: () => Promise<T>): Promise<T> {
    return this.accountLocks.run(accountId, fn);
  }

  /**
   * Cash implied by `accountId`'s resting buy orders across every book. The
   * durable figure is accounts.reserved_cash_minor; this is used to reconcile it.
   */
  bookReservedCash(accountId: string): number {
    let total = 0;
    for (const rt of this.runtimes.values())
      total += exposureOf(rt.state.book, accountId).buyNotional;
    return total;
  }

  snapshot(symbol: string, depth = this.depthLevels): MarketMessage | null {
    const rt = this.runtimes.get(symbol);
    if (!rt) return null;
    const d = toDepth(rt.state.book, depth);
    return { type: 'snapshot', symbol, seq: rt.state.seq, bids: d.bids, asks: d.asks };
  }

  subscribe(symbol: string, listener: MarketListener): () => void {
    const set = this.listeners.get(symbol) ?? new Set<MarketListener>();
    set.add(listener);
    this.listeners.set(symbol, set);
    return () => {
      set.delete(listener);
    };
  }

  private publish(symbol: string, message: MarketMessage): void {
    for (const listener of this.listeners.get(symbol) ?? []) {
      try {
        listener(message);
      } catch {
        // A failing subscriber must never affect matching or other subscribers.
      }
    }
  }
}
