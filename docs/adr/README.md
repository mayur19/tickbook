# Architecture Decision Records

Decisions use the MADR format. Status values: Proposed, Accepted, Superseded.

| ADR                                               | Title                                                                 | Status   | Domain-specific |
| ------------------------------------------------- | --------------------------------------------------------------------- | -------- | --------------- |
| [0001](0001-modular-monolith-npm-workspaces.md)   | Modular monolith with npm workspaces                                  | Accepted | no              |
| [0002](0002-fastify-and-node-postgres.md)         | Fastify 5 and node-postgres without an ORM                            | Accepted | no              |
| [0003](0003-functional-core-imperative-shell.md)  | Functional core, imperative shell: pure engine and a Venue shell      | Accepted | yes             |
| [0004](0004-command-journal-replay.md)            | Command (input) journal in PostgreSQL with replay recovery            | Accepted | yes             |
| [0005](0005-single-writer-per-instrument.md)      | Single writer per instrument via promise-chain serialization          | Accepted | yes             |
| [0006](0006-integer-minor-units.md)               | Integer minor units for prices and quantities                         | Accepted | yes             |
| [0007](0007-price-time-priority.md)               | Price-time priority FIFO with trades at the maker price               | Accepted | yes             |
| [0008](0008-persistent-order-book.md)             | Persistent immutable order book with structural sharing               | Accepted | yes             |
| [0009](0009-linear-scan-order-lookup.md)          | Linear-scan order lookup for cancel (index deferred)                  | Accepted | yes             |
| [0010](0010-journal-then-install.md)              | Journal-then-install: durable transaction before installing state     | Accepted | yes             |
| [0011](0011-risk-inside-serialized-section.md)    | Pre-trade risk evaluated inside the serialized section                | Accepted | yes             |
| [0012](0012-l2-snapshot-and-diffs.md)             | L2 snapshot plus incremental diffs over WebSocket                     | Accepted | yes             |
| [0013](0013-in-process-login-throttling.md)       | In-process login throttling with a bounded store                      | Accepted | no              |
| [0014](0014-cookie-sessions-csrf.md)              | Cookie sessions with HMAC-hashed tokens and CSRF double-submit        | Accepted | no              |
| [0015](0015-property-and-differential-testing.md) | Property-based and differential testing of the engine                 | Accepted | no              |
| [0016](0016-market-order-semantics.md)            | Market orders are IOC/FOK only; risk rejections are not journaled     | Accepted | yes             |
| [0017](0017-native-postgres-no-containers.md)     | Native PostgreSQL in CI and deployment, no containers                 | Accepted | no              |
| [0018](0018-registration-without-enumeration.md)  | Registration without account enumeration                              | Accepted | no              |
| [0019](0019-durable-cash-reservations.md)         | Durable cross-instrument cash reservations and unfunded-maker cancels | Accepted | yes             |

Eleven of eighteen records are domain-specific decisions about the matching engine, journal, risk and market data.
