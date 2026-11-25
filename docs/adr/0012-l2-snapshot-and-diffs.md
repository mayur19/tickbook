# ADR-0012: L2 snapshot plus incremental diffs over WebSocket

- Status: Accepted
- Date: 2026-11-24

## Context

The trade screen needs live depth with low bandwidth, and clients must be able to reconstruct the exact server view.

## Decision Drivers

- Small messages
- Provably correct reconstruction
- Simple client code

## Considered Options

1. Push a full snapshot after every change
2. Level-3 order-by-order feed
3. Snapshot on subscribe, then level diffs (`quantity 0` = removal) tagged with engine `seq`, plus trade messages

## Decision Outcome

Chosen: **snapshot + diffs** at a fixed published depth (`DEPTH_PUBLISH_LEVELS`, default 20). `diffDepth(prev, next)` emits removals, additions and changes; clients apply them with the shared `applyDepthUpdates`. Clients may send `snapshot` to resync. Slow consumers are closed above 1 MB buffered.

## Consequences

- Good: round-trip property test proves `apply(prev, diff(prev, next)) = next`.
- Good: browser and server share the same reconstruction code.
- Bad: `seq` is the engine sequence, which skips values for commands that do not change depth, so clients cannot detect gaps from seq alone; per-channel sequences are TB-403.
