# ADR-0014: Cookie sessions with HMAC-hashed tokens and CSRF double-submit

- Status: Accepted
- Date: 2026-11-24

## Context

The web app is same-origin; sessions must be revocable immediately (logout, future role changes) and safe against token theft from a database dump.

## Decision Drivers

- Immediate revocation
- No secrets usable from a database leak
- Simple browser integration
- CSRF protection for cookie auth

## Considered Options

1. Stateless JWT in localStorage
2. JWT in cookie with refresh tokens
3. Opaque random token in an HttpOnly SameSite=Lax cookie, stored as HMAC-SHA256(token, SESSION_SECRET), plus a per-session CSRF token

## Decision Outcome

Chosen: **server-side sessions**. `tb_session` (HttpOnly) and `tb_csrf` (readable) cookies; mutating requests with a session must send `x-csrf-token` equal to the session's token (timing-safe compare). Passwords use scrypt (N=16384, r=8, p=1) with a dummy hash to equalise timing for unknown users.

## Consequences

- Good: logout deletes the row; the next request is unauthenticated (tested).
- Good: a leaked sessions table does not grant access without `SESSION_SECRET`.
- Bad: one database read per request (indexed, cheap).
- Bad: API clients for strategies need a different scheme (API keys with request signing, TB-810).
