# Security policy

Tickbook is a simulated trading venue. It holds no real money, but it does hold credentials and
confidential (simulated) order flow, so security reports are welcome and taken seriously.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |

## Reporting a vulnerability

Please do **not** open a public issue. Use GitHub's private vulnerability reporting
("Security" tab -> "Report a vulnerability") on `mayur19/tickbook`. Include steps to reproduce,
affected endpoints or files, and the impact you observed. You can expect an acknowledgement within
five working days and a fix or mitigation plan within thirty days for confirmed issues.

## Scope

In scope: the API, matching engine, WebSocket, web app, migrations, `run.sh` and the deployment
guidance in `docs/operations`. Out of scope: denial of service by raw traffic volume, issues that
require a compromised host or database superuser, and the demo credentials of the local seed.

## Known limitations

- **Login and registration throttle counters are kept in process memory.** They reset on restart
  and do not coordinate across processes. Tickbook must run as a single API instance (which the
  matching design also requires) until the counters move to PostgreSQL (TB-813).
- `TRUST_PROXY` must be set correctly behind a reverse proxy; otherwise all clients share the
  proxy's address for throttling. The value `true` is rejected and production refuses to start
  without an explicit value.
- Registration creates the firm immediately; email-verified signup via the local outbox is planned
  (TB-812). The endpoint does not reveal whether an email is already registered.
- Journal entries are not yet hash-chained (TB-605); integrity relies on database permissions.

The full analysis is in [docs/security/threat-model.md](docs/security/threat-model.md).
