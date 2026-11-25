# ADR-0018: Registration without account enumeration

- Status: Accepted
- Date: 2026-11-24

## Context

A registration endpoint that says "email already exists" lets anyone test whether a person uses the venue.

## Decision Drivers

- No email enumeration
- Rate limited
- Path to verified signup

## Considered Options

1. Return 409 EMAIL_TAKEN
2. Return 201 and log the user in
3. Always return 202 with a generic message, issue no session, user signs in afterwards

## Decision Outcome

Chosen: **generic 202**. Both new and duplicate emails hash the password (equal timing) and return the same body; duplicates are audited as `organization.register_duplicate_email`. Registration is limited per normalised IP (`REGISTER_RATE_LIMIT_PER_HOUR`). Email-verified signup through the local outbox is pending (TB-812, `POST /api/v1/auth/verify-email` answers 501).

## Consequences

- Good: response is identical for both cases (tested).
- Bad: a user who mistypes an existing email gets no hint until verification email lands (TB-812).
- Neutral: the web app signs in automatically after a successful registration.
