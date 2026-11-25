import { describe, expect, it } from 'vitest';
import {
  formatMinor,
  hasPermission,
  loginSchema,
  parseMinor,
  pendingOrderFeature,
  placeOrderSchema,
  registerSchema,
  type PlaceOrderInput,
} from '../src/index.js';

describe('money formatting', () => {
  it.each([
    [0, '0.00'],
    [5, '0.05'],
    [123456, '1,234.56'],
    [-1050, '-10.50'],
  ])('formats %i as %s', (minor, text) => expect(formatMinor(minor)).toBe(text));

  it('formats with zero decimals', () => expect(formatMinor(1234, 0)).toBe('1,234'));

  it('parses decimal strings to minor units', () => {
    expect(parseMinor('101.25')).toBe(10125);
    expect(parseMinor('7')).toBe(700);
    expect(parseMinor('1.2')).toBe(120);
    expect(parseMinor('1.234')).toBeNull();
    expect(parseMinor('abc')).toBeNull();
    expect(parseMinor('99999999999999999999')).toBeNull();
  });
});

describe('schemas', () => {
  const order = {
    accountId: '7a1c0d7e-3f0e-4c55-9a43-5d6f1a0b9c11',
    symbol: 'tbk',
    side: 'buy',
    type: 'limit',
    price: 10000,
    quantity: 10,
  };

  it('normalises and defaults order input', () => {
    const parsed = placeOrderSchema.parse(order);
    expect(parsed.symbol).toBe('TBK');
    expect(parsed.timeInForce).toBe('GTC');
  });

  it('rejects fractional prices and bad symbols', () => {
    expect(placeOrderSchema.safeParse({ ...order, price: 100.5 }).success).toBe(false);
    expect(placeOrderSchema.safeParse({ ...order, symbol: 'BAD SYMBOL' }).success).toBe(false);
  });

  it('identifies pending order features with their tickets', () => {
    const p = (patch: Partial<PlaceOrderInput>) =>
      pendingOrderFeature({ ...placeOrderSchema.parse(order), ...patch });
    expect(p({})).toBeNull();
    expect(p({ type: 'stop' })?.ticket).toBe('TB-201');
    expect(p({ type: 'stop_limit' })?.ticket).toBe('TB-201');
    expect(p({ displayQuantity: 10 })?.ticket).toBe('TB-202');
    expect(p({ postOnly: true })?.ticket).toBe('TB-203');
    expect(p({ timeInForce: 'DAY' })?.ticket).toBe('TB-204');
  });

  it('validates registration and login', () => {
    expect(
      registerSchema.safeParse({
        organizationName: 'Acme',
        displayName: 'A',
        email: 'A@X.example',
        password: 'short',
      }).success,
    ).toBe(false);
    expect(loginSchema.parse({ email: ' A@X.EXAMPLE ', password: 'p' }).email).toBe('a@x.example');
  });
});

describe('rbac', () => {
  it('grants permissions by role', () => {
    expect(hasPermission('owner', 'audit:read')).toBe(true);
    expect(hasPermission('trader', 'orders:place')).toBe(true);
    expect(hasPermission('viewer', 'orders:place')).toBe(false);
  });
});
