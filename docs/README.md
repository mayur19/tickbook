# Tickbook documentation

Tickbook is a **simulated** exchange order-matching engine and paper-trading venue for education and
strategy testing. Nothing in this repository moves real money or connects to a real market.

## Product

| Document                                                                     | Contents                                                                                                    |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [product/PRD.md](product/PRD.md)                                             | Vision, problem, personas, goals and non-goals, scope, metrics, release plan                                |
| [product/requirements.md](product/requirements.md)                           | Numbered functional (FR) and non-functional (NFR) requirements with MoSCoW priority and acceptance criteria |
| [product/user-stories.md](product/user-stories.md)                           | Epics and stories with Given/When/Then acceptance criteria                                                  |
| [product/requirements-traceability.md](product/requirements-traceability.md) | FR to epic, ticket, module, test and status                                                                 |
| [glossary.md](glossary.md)                                                   | Market-structure and project vocabulary                                                                     |

## Architecture and design

| Document                                                                 | Contents                                                                                                      |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| [architecture/overview.md](architecture/overview.md)                     | C4 context, container and component views; module boundaries; request lifecycle                               |
| [architecture/quality-attributes.md](architecture/quality-attributes.md) | Measurable quality targets and how each is verified                                                           |
| [adr/README.md](adr/README.md)                                           | Index of architecture decision records (MADR format)                                                          |
| [design/system-design.md](design/system-design.md)                       | State machines, sequence diagrams, matching and depth algorithms with complexity, concurrency and consistency |
| [design/data-model.md](design/data-model.md)                             | Full target ERD, table notes, indexes, migrated vs planned tables                                             |

## API

| Document                             | Contents                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| [api/openapi.yaml](api/openapi.yaml) | OpenAPI 3.1 for the full target API, `x-status` per operation, WebSocket contract |
| [api/README.md](api/README.md)       | Conventions, envelope, error codes, auth and CSRF, rate limits, curl examples     |

## Security, testing and operations

| Document                                             | Contents                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| [security/threat-model.md](security/threat-model.md) | STRIDE, trust boundaries, mitigations, OWASP ASVS mapping                     |
| [testing/test-strategy.md](testing/test-strategy.md) | Test pyramid, property and differential testing, acceptance matrix, coverage  |
| [operations/runbook.md](operations/runbook.md)       | Configuration, commands, backup/restore, troubleshooting                      |
| [operations/deployment.md](operations/deployment.md) | VM deployment with systemd, nginx and native PostgreSQL; release and rollback |

## Planning

| Document                                                               | Contents                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------- |
| [planning/roadmap.md](planning/roadmap.md)                             | Milestones M0 to M8 with exit criteria                  |
| [planning/backlog.md](planning/backlog.md)                             | Every ticket with estimate, status and dependencies     |
| [planning/implementation-status.md](planning/implementation-status.md) | What is done (10.9%), what is stubbed, progress by area |
| [planning/risks.md](planning/risks.md)                                 | Risk register                                           |
