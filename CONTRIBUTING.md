# Contributing

Thanks for helping build Tickbook, a simulated exchange for education and strategy testing.

## Setup

```bash
./run.sh setup     # Node 22+, native PostgreSQL 15+ on the local socket
./run.sh           # start API and web
```

## Workflow

1. Pick a ticket from [docs/planning/backlog.md](docs/planning/backlog.md) (or open an issue that
   references one) and create a branch: `feat/TB-201-stop-orders`.
2. Write tests first. Engine work starts in `packages/shared/test`.
3. Keep changes small and focused; files under 400 lines, functions small, no mutation in domain code.
4. Run `./run.sh check` (lint, format check, typecheck, all tests) before pushing.
5. Update docs in the same change: requirements status, OpenAPI `x-status`, backlog status and
   [implementation-status.md](docs/planning/implementation-status.md) when a ticket is done.
6. Open a pull request using the template; CI must be green.

## Commit messages

Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `perf:`, `ci:`,
optionally scoped (`feat(shared): ...`). Reference ticket IDs in the body.

## Rules for engine changes

The matching engine is the heart of the product and its correctness argument rests on a few rules:

- `applyCommand` stays **pure and deterministic**: no clock reads, no randomness, no I/O, no
  iteration order that depends on insertion of non-deterministic keys. Everything variable (IDs,
  timestamps) arrives inside the command.
- The property tests and the differential test against `reference-model.ts` must stay green. When
  you add an order type, extend the reference model first, then the engine.
- Never change the meaning of an existing journaled command. New behaviour gets a new command kind
  or field so old journals replay identically (engine version stamping is planned in TB-612).
- Prices and quantities are integers (minor units and lots). No floating point in the engine.
- Run `npm run bench -w @tickbook/shared` before and after performance-sensitive changes and note the
  numbers in the pull request.

## Database changes

Add a new numbered file in `apps/api/migrations/`. Never edit an applied migration (checksums are
verified). Migrations must be backward compatible with the previous release so rollback is a symlink
switch (see [docs/operations/deployment.md](docs/operations/deployment.md)).

## Code of conduct

Be respectful and constructive. Assume good intent, review the code not the person.
