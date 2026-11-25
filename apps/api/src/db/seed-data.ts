/** Demo data for local development. Credentials are development-only and documented in README. */
export const DEMO_PASSWORD = 'tickbook-demo-pass';

export const INSTRUMENTS = [
  {
    symbol: 'TBK',
    name: 'Tickbook Demo Corp',
    currency: 'USD',
    tickSize: 1,
    lotSize: 1,
    maxOrderQty: 50_000,
    referencePrice: 10_000,
    priceBandBps: 1000,
  },
  {
    symbol: 'ACME',
    name: 'Acme Robotics (simulated)',
    currency: 'USD',
    tickSize: 5,
    lotSize: 10,
    maxOrderQty: 100_000,
    referencePrice: 5_240,
    priceBandBps: 1000,
  },
  {
    symbol: 'GLBX',
    name: 'Globex Energy (simulated)',
    currency: 'USD',
    tickSize: 1,
    lotSize: 100,
    maxOrderQty: 500_000,
    referencePrice: 1_875,
    priceBandBps: 1500,
  },
] as const;

export const FIRMS = [
  {
    name: 'Liquidity Desk',
    users: [
      { email: 'mm@tickbook.local', displayName: 'Market Maker Bot', role: 'owner' as const },
    ],
    account: {
      name: 'Market Making',
      cashMinor: 5_000_000_000,
      maxPosition: 10_000_000,
      maxOrderNotional: 500_000_000,
    },
    positions: { TBK: 200_000, ACME: 200_000, GLBX: 2_000_000 },
  },
  {
    name: 'Northwind Capital',
    users: [
      { email: 'demo@tickbook.local', displayName: 'Dana Demo', role: 'owner' as const },
      { email: 'trader@tickbook.local', displayName: 'Theo Trader', role: 'trader' as const },
      { email: 'viewer@tickbook.local', displayName: 'Vera Viewer', role: 'viewer' as const },
    ],
    account: {
      name: 'Primary',
      cashMinor: 100_000_000,
      maxPosition: 100_000,
      maxOrderNotional: 50_000_000,
    },
    positions: { TBK: 500, ACME: 1_000, GLBX: 10_000 },
  },
] as const;
