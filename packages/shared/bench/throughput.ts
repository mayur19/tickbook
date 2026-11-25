/**
 * Single-instrument engine throughput probe (no I/O): `npm run bench -w @tickbook/shared`.
 * Replays a deterministic pseudo-random stream of limit/market/IOC/cancel commands
 * and reports commands per second and per-command latency percentiles.
 */
import { performance } from 'node:perf_hooks';
import { applyCommand, initialState, type EngineCommand, type InstrumentSpec } from '../src/index.js';

const SPEC: InstrumentSpec = { symbol: 'BENCH', tickSize: 1, lotSize: 1, maxOrderQty: 1_000_000 };
const COMMANDS = Number(process.argv[2] ?? 100_000);

let seed = 42;
const rand = (): number => {
  seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
  return seed / 2_147_483_648;
};

const stream: EngineCommand[] = [];
for (let i = 0; i < COMMANDS; i += 1) {
  const r = rand();
  if (r < 0.15 && i > 0) {
    stream.push({ kind: 'cancel', orderId: `o${Math.floor(rand() * i)}`, accountId: 'a', ts: '' });
    continue;
  }
  const side = rand() < 0.5 ? 'buy' : 'sell';
  const market = r > 0.95;
  stream.push({
    kind: 'place',
    ts: '',
    order: {
      orderId: `o${i}`,
      accountId: 'a',
      side,
      type: market ? 'market' : 'limit',
      tif: market || r > 0.85 ? 'IOC' : 'GTC',
      ...(market ? {} : { price: 10_000 + Math.round((rand() - 0.5) * 100) }),
      quantity: 1 + Math.floor(rand() * 100),
    },
  });
}

const latencies = new Float64Array(COMMANDS);
let state = initialState(SPEC.symbol);
let trades = 0;
const start = performance.now();
for (let i = 0; i < COMMANDS; i += 1) {
  const t0 = performance.now();
  const r = applyCommand(SPEC, state, stream[i] as EngineCommand);
  latencies[i] = performance.now() - t0;
  state = r.state;
  for (const e of r.events) if (e.type === 'trade') trades += 1;
}
const elapsed = performance.now() - start;
const sorted = Array.from(latencies).sort((a, b) => a - b);
const pct = (p: number) => ((sorted[Math.floor((p / 100) * (sorted.length - 1))] ?? 0) * 1000).toFixed(1);

console.warn(
  JSON.stringify({
    commands: COMMANDS,
    trades,
    restingLevels: state.book.bids.length + state.book.asks.length,
    commandsPerSecond: Math.round((COMMANDS / elapsed) * 1000),
    p50Micros: pct(50),
    p99Micros: pct(99),
    p999Micros: pct(99.9),
  }),
);
