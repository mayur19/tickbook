# ADR-0017: Native PostgreSQL in CI and deployment, no containers

- Status: Accepted
- Date: 2026-11-24

## Context

The project standard forbids containers. CI must still run integration tests against a real PostgreSQL.

## Decision Drivers

- Real database in tests
- No container runtime anywhere
- Reproducible developer setup

## Considered Options

1. Container service in CI
2. SQLite or in-memory fakes for tests
3. The runner's preinstalled PostgreSQL (`systemctl start postgresql`) and a locally installed server for development

## Decision Outcome

Chosen: **native PostgreSQL**. CI creates a `tickbook` role and `tickbook_test` database with `sudo -u postgres`; locally `run.sh` connects over the `/tmp` socket as the current OS user. Deployment uses systemd + nginx + native PostgreSQL.

## Consequences

- Good: tests exercise real constraints, advisory locks and transactions.
- Bad: PostgreSQL version follows the runner image (currently 16); migrations avoid version-specific features beyond 15.
- Neutral: developers need a local server; `run.sh` checks and explains.
