# ADR-0001: Modular monolith with npm workspaces

- Status: Accepted
- Date: 2026-11-24

## Context

Tickbook needs an engine, an HTTP/WebSocket API and a browser UI that share domain types and pure algorithms (depth reconstruction, money formatting, order schemas). The team is small and the venue runs as one process per deployment.

## Decision Drivers

- One deploy unit and one CI pipeline
- Share pure domain code between server and browser without publishing packages
- Clear seams so the engine could later move into worker threads or a separate process

## Considered Options

1. Single package
2. Microservices (engine service, API gateway, market-data service)
3. Modular monolith with npm workspaces (`packages/shared`, `apps/api`, `apps/web`)

## Decision Outcome

Chosen: **modular monolith with npm workspaces**. `packages/shared` ships TypeScript sources consumed by both apps; the API bundles it with tsup (`noExternal`).

## Consequences

- Good: one `npm ci`, one lint/typecheck/test command, atomic cross-layer changes.
- Good: the engine is already isolated behind a pure API, so extracting it (TB-607) is mechanical.
- Bad: workspace hoisting can mix tool versions (we pinned Vite 7 so Vitest and the React plugin agree).
- Bad: module boundaries inside `apps/api` are enforced by convention and review, not by the build.
