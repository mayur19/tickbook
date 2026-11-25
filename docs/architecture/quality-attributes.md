# Quality attributes

Measurable targets for the non-functional requirements in
[../product/requirements.md](../product/requirements.md), how each is verified today, and what is
still planned. Numbers marked _measured_ come from the repository as it stands.

## Summary

| Attribute         | Target                                                                        | Current (measured)                                     | Verified by                                                    |
| ----------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------- |
| Correctness       | Engine agrees with a naive reference matcher on every random stream           | 300 random streams per property, 0 disagreements       | `packages/shared/test/engine.property.test.ts`                 |
| Determinism       | Replay of the journal reproduces state bit-for-bit                            | Holds for full and split replays (property)            | property `is deterministic`, `recovery.db.test.ts`             |
| Engine latency    | p99 < 100 µs per command in memory (single instrument)                        | p50 18 µs, p99 38 µs, p99.9 48 µs                      | `npm run bench -w @tickbook/shared` (100k commands)            |
| Engine throughput | > 25k commands/s per instrument in memory                                     | ~53k commands/s                                        | same benchmark                                                 |
| Durable latency   | p99 < 25 ms HTTP order acknowledgement on a laptop-class host                 | Not yet benchmarked                                    | planned TB-610                                                 |
| Recoverability    | Restart rebuilds every book from the journal; RPO = 0 for acknowledged orders | Replay at boot, journal gap refuses start              | `recovery.db.test.ts`, `index.ts` reconcile                    |
| Consistency       | Book and `orders` table never disagree after a command                        | Reconcile returns no problems after randomized flows   | `reconcile()` in tests; blocking reconcile planned TB-603      |
| Security          | ASVS L2 controls for auth, session, access control                            | See threat model mapping                               | `auth.http.test.ts`, `throttle.test.ts`, `orders.http.test.ts` |
| Test coverage     | ≥ 80% lines on implemented code                                               | shared ~100%, api ~97%, web ~100% lines                | `npm run test:coverage` thresholds in CI                       |
| Operability       | One command to set up; health/readiness; structured logs with request ids     | `./run.sh` setup/start/test/reset; `/health`, `/ready` | CI + manual runbook drill                                      |
| Portability       | No containers, no external services                                           | Native PostgreSQL in CI and docs                       | `.github/workflows/ci.yml`                                     |

## Performance

**Measured engine numbers** (Apple silicon laptop, Node 25, `packages/shared/bench/throughput.ts`):
100,000 commands over a ±50-tick band (15% cancels, 5% market, 10% IOC), 67k trades,
**~53,000 commands/s**, **p50 18 µs, p99 38 µs, p99.9 48 µs**.

The engine uses a persistent order book ([ADR-0008](../adr/0008-persistent-order-book.md)); level
insertion copies the level array (O(L)) and cancel scans for the order
([ADR-0009](../adr/0009-linear-scan-order-lookup.md)). The benchmark keeps books shallow (~50 levels),
which matches simulator usage. Deep books are the trigger for TB-114 (indexed lookup) and TB-115
(mutable hot path verified against the pure engine).

**Durable path:** each command is one PostgreSQL transaction (journal + order rows + trades +
settlement + audit). That bounds per-instrument throughput by commit latency (typically 1–3 ms
locally), i.e. hundreds of commands/s per instrument. Group commit (TB-606) and worker threads
(TB-607) are the planned levers; TB-610 adds an end-to-end benchmark.

## Correctness and determinism

- Six fast-check properties × 300 runs on streams of up to 120 commands: book never crossed or
  malformed; exact agreement with the reference model on trades and resting orders; quantity
  conservation; no trade through a limit; FOK all-or-nothing and IOC/market never rest; replay
  determinism and dense trade ids.
- Depth diff round-trip property (200 runs): `applyDepthUpdates(prev, diffDepth(prev, next))`
  equals `next` for any engine evolution — guarantees WebSocket clients reconstruct the server view.
- Arbitraries are seeded by fast-check only (no `Math.random`), so a failure reproduces from its seed.

## Recoverability

| Scenario                                   | Behaviour                                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Process crash before journal commit        | Command not acknowledged; state never installed; nothing to recover                            |
| Process crash after commit, before install | Boot replay includes the command; client saw an error or timeout and can query the order by id |
| Journal sequence gap                       | `recoverVenue` throws and the API refuses to start                                             |
| Book vs order-table mismatch               | Logged as a warning at boot today; blocking in TB-603                                          |
| Database loss                              | `pg_dump` restore (runbook); journal is restored with orders atomically                        |

## Security

Targets and controls are mapped in [../security/threat-model.md](../security/threat-model.md).
Measured by tests: generic registration response (no enumeration), per-email backoff, per-IP
limits, parallel login attempts counted before any await, CSRF enforcement, RBAC 403s, tenant 404s,
counterparty ids absent from execution reports, 501 stubs still require authentication.

## Operability

- Structured JSON logs (pino) with request ids; cookies, authorization and CSRF headers redacted.
- `GET /health` (liveness) and `GET /ready` (database reachable, instrument count).
- Boot log reports per-instrument journal length and resting order counts.
- Metrics endpoint and dashboards are planned (TB-952).
