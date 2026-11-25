# ADR-0002: Fastify 5 and node-postgres without an ORM

- Status: Accepted
- Date: 2026-11-24

## Context

The API is latency sensitive on the order path and needs WebSocket support, cookie handling and an injectable test harness. Persistence uses hand-tuned SQL (partial indexes, `ON CONFLICT`, advisory locks).

## Decision Drivers

- Low per-request overhead
- First-class WebSocket and `inject` testing
- Full control of SQL inside one transaction per command
- Lean dependency list

## Considered Options

1. Express + an ORM (Prisma/TypeORM)
2. Fastify 5 + Knex
3. Fastify 5 + `pg` with plain SQL in repositories

## Decision Outcome

Chosen: **Fastify 5 + `pg`**, zod for validation at boundaries, pino for logs. Repositories accept a `Queryable` so the same function runs on the pool or a transaction client.

## Consequences

- Good: `app.inject` and `injectWS` make integration tests fast and deterministic.
- Good: the order transaction is explicit and reviewable; no hidden queries.
- Bad: no schema-to-type generation; row types are written by hand (mitigated by small repositories).
- Bad: int8 handling must be configured manually (see ADR-0006).
