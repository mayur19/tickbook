# User stories

Stories are grouped by epic and reference requirements (FR) and backlog tickets (TB). Tickbook is a
simulated venue: "cash" and "positions" below are paper balances only.

Status markers: **[done]** implemented and tested, **[planned]** pending.

## E0 Firms and access

### US-001 Register a paper-trading firm [done]

As a firm owner (Olivia) I want to register my club as a firm so that my team can trade on the venue.
Refs: FR-001, FR-008, TB-008, TB-011.

- Given I am not registered, when I submit organization, name, email and a 12+ character password,
  then I receive a generic "sign in to continue" message and can log in as owner of a firm with one
  account holding 1,000,000.00 simulated USD.
- Given the email already belongs to someone, when I submit the form, then I receive the identical
  response, nothing is created, and the attempt is audited.
- Given I have submitted 5 registrations from my IP this hour, when I submit another, then I receive
  `429` with a `Retry-After` header.

### US-002 Sign in safely [done]

As a student (Sam) I want to sign in and stay signed in for a trading session.
Refs: FR-002, FR-003, FR-004, FR-006, FR-007, TB-008, TB-009, TB-011.

- Given valid credentials, when I sign in, then I get an HttpOnly session cookie and the app shows
  my firm and role.
- Given I mistype my password repeatedly, when I reach the 5th consecutive failure, then further
  attempts for that email wait with exponentially growing delays and the API returns `429`.
- Given an attacker sends many guesses in parallel, when they arrive at once, then only the allowed
  number are evaluated because each attempt is counted before any database work.
- Given I sign out, when I reuse the old cookie, then requests are rejected with `401`.

### US-003 Roles limit what members can do [done]

As an owner I want viewers to watch without trading. Refs: FR-005, TB-009.

- Given I am a viewer, when I open the trade screen, then the ticket is disabled and the API rejects
  order placement with `403`.

### US-004 Invite teammates [planned]

As an owner I want to invite members by email. Refs: FR-069, TB-801, TB-802, TB-814.

- Given I invite a teammate, when the invitation is created, then a message appears in the local
  outbox with a single-use link that expires in 72 hours.
- Given I am the only owner, when I try to demote myself, then the request is refused.

### US-005 Connect a strategy with an API key [planned]

As a quant hobbyist (Quinn) I want an API key so my script can trade. Refs: FR-070, TB-810.

- Given I create a key scoped to `orders:place`, when my script signs a request with it, then the
  order is accepted; a request with a stale timestamp or wrong signature is rejected.

## E1 Trading on the central limit order book

### US-010 Place a limit order and see it rest [done]

As a student I want my limit order to join the book at my price. Refs: FR-012, FR-015, FR-027,
FR-028, TB-102, TB-107, TB-110.

- Given the best ask is above my price, when I submit a GTC buy limit, then it appears in the depth
  ladder at my price with my quantity, and my available cash drops by price x quantity.
- Given my price is not a multiple of the tick size, when I submit, then the ticket warns me before
  sending and the API would reject with `price_not_tick_multiple`.

### US-011 Cross the spread and get filled fairly [done]

As a student I want to understand which orders I traded with. Refs: FR-013, FR-014, FR-023, FR-025,
TB-102, TB-109.

- Given two asks at 100.00 (placed earlier and later) and one at 100.05, when I buy at 100.05 for the
  combined size, then I trade with the earlier 100.00 order first, then the later one, then 100.05,
  each at the resting price.
- When the fill completes, then my cash and position update in the same moment and the response
  shows trade ids and prices but not who I traded with.

### US-012 Use IOC, FOK and market orders [done]

As a quant hobbyist I want exchange-accurate time-in-force behaviour. Refs: FR-016, FR-017, FR-018,
TB-103.

- Given 50 shares offered at my limit, when I send an IOC for 80, then 50 fill and 30 are cancelled
  with reason `ioc_remainder`.
- Given only 50 shares available within my limit, when I send an FOK for 80, then nothing trades and
  the order is cancelled with `fok_unfillable`.
- Given I send a market order with GTC, then it is rejected with `invalid_tif_for_market`.

### US-013 Be protected by pre-trade risk [done]

As an educator (Elena) I want obviously wrong orders blocked. Refs: FR-022, TB-108.

- Given my open buy orders already reserve most of my cash, when I send a buy that exceeds the rest,
  then it is rejected with `insufficient_buying_power` and recorded as a rejected order.
- Given the last trade is 100.05 and the band is 10%, when I send a buy at 90.00, then it is rejected
  with `price_band_exceeded`.
- Given I hold 100 shares, when I try to sell 200, then it is rejected with `insufficient_position`.

### US-014 Cancel a resting order [done]

As a student I want to pull my order. Refs: FR-019, TB-107.

- Given my order rests, when I click Cancel, then it leaves the ladder, its status is `cancelled`
  with reason `user_requested`, and the reserved cash is released.
- Given the order already filled, when I cancel, then I get `409 ORDER_NOT_OPEN`.

### US-015 The venue survives a restart [done]

As a venue operator (Victor) I want the books to come back exactly after a restart. Refs: FR-020,
FR-021, TB-105.

- Given a session with resting orders, fills and cancels, when the API restarts, then every book is
  identical, including queue order and the next trade id, and the reconciliation report is empty.
- Given the journal has a missing sequence number, when the API starts, then it refuses to start.

### US-016 Amend an order without losing my place [planned]

Refs: FR-040, TB-210.

- Given my order rests with quantity 100, when I amend it down to 60, then it keeps its queue
  position; when I change its price, then it moves to the back of the new level.

### US-017 Stop orders [planned]

Refs: FR-035, TB-201.

- Given a sell stop at 95.00, when a trade prints at or below 95.00, then my stop triggers as a
  market (or limit for stop-limit) order within the same command, before later commands.

### US-018 Prevent trading with myself [planned]

Refs: FR-039, TB-205.

- Given self-trade prevention is set to cancel-newest, when my buy would cross my own resting sell,
  then the incoming order is cancelled and no trade prints.

## E3 Money

### US-030 See my P&L [planned]

As a student I want realised and unrealised P&L. Refs: FR-044, TB-303, TB-905.

- Given I bought 100 at 100.00 and sold 40 at 101.00, then realised P&L shows 40.00 and unrealised is
  marked at the last trade for the remaining 60.

### US-031 Every movement is in the ledger [planned]

Refs: FR-043, TB-301, TB-302.

- Given any fill, when I open the ledger, then I see balanced postings for cash, position and fees,
  and the account balance equals the sum of postings.

### US-032 Pay maker and taker fees [planned]

Refs: FR-045, TB-310, TB-311.

- Given a schedule of 0.10 bp maker rebate and 0.30 bp taker fee, when my aggressive order fills,
  then a taker fee posting appears and the maker receives the rebate.

## E4 Market data

### US-040 Watch the book move live [done]

As a student I want a live depth ladder and tape. Refs: FR-028, FR-029, FR-032, TB-110, TB-902.

- Given I open the trade screen, when another firm's order rests or trades, then my ladder and tape
  update within a second without reloading, and the connection indicator is green.
- Given the socket drops, then the app reconnects and starts from a fresh snapshot.

### US-041 Candles and charts [planned]

Refs: FR-051, FR-052, TB-401, TB-405.

- Given trades during the session, when I open Charts, then 1-minute candles match the trades tape.

## E5 Venue operations

### US-050 Halt an instrument [planned]

As a venue operator I want to halt trading. Refs: FR-057, TB-510.

- Given an instrument is halted, when a firm submits an order, then it is rejected with
  `INSTRUMENT_NOT_OPEN`; cancels still work; the halt is a journaled command.

### US-051 Run the opening auction [planned]

Refs: FR-059, TB-520 to TB-524.

- Given orders collected during pre-open, when the auction uncrosses, then all executions happen at
  one price that maximises volume, and the indicative price was visible during the call.

### US-052 Circuit breaker [planned]

Refs: FR-058, TB-511, TB-512.

- Given a trade would print more than the dynamic band away from the reference, then continuous
  trading pauses for the configured cool-down and resumes via an auction.

## E6 Resilience

### US-060 Fast restart from snapshots [planned]

Refs: FR-060, TB-602.

- Given a long journal, when the API restarts, then it loads the latest snapshot and replays only the
  tail, producing the same state as a full replay.

## E7 Surveillance

### US-070 Spot a wash trade [planned]

As a surveillance analyst (Ana) I want alerts for trades between accounts of the same firm.
Refs: FR-064, FR-066, TB-701, TB-703.

- Given two accounts of one firm trade with each other, then an alert is raised with both orders and
  the journal sequence numbers.

### US-071 Replay the market [planned]

Refs: FR-068, TB-706.

- Given an alert at sequence 1,234, when I open the replay viewer, then I see the book as it was at
  that sequence and can step forward command by command.

## E9 Experience

### US-090 Know what is not built yet [done]

Refs: FR-011, FR-034, TB-012, TB-901.

- Given I click a navigation item marked "Planned", then I see what it will do and which backlog
  tickets track it; calling its API returns `501` with the ticket id.
