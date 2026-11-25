import type { OrderStatus, Permission, Role } from '@tickbook/shared';

export interface Me {
  user: { id: string; email: string; displayName: string };
  organization: { id: string; name: string };
  role: Role;
  permissions: Permission[];
  csrfToken: string;
}

export interface Instrument {
  id: string;
  symbol: string;
  name: string;
  currency: string;
  tickSize: number;
  lotSize: number;
  maxOrderQty: number;
  referencePrice: number;
  status: string;
  lastPrice: number | null;
  quote: { bid: number | null; ask: number | null };
}

export interface Account {
  id: string;
  name: string;
  currency: string;
  cashMinor: number;
  reservedCashMinor: number;
  availableCashMinor: number;
  positions: { symbol: string; quantity: number }[];
}

export interface Order {
  id: string;
  clientOrderId: string | null;
  accountId: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  timeInForce: 'GTC' | 'IOC' | 'FOK';
  price: number | null;
  quantity: number;
  filledQuantity: number;
  filledNotional: number;
  remainingQuantity: number;
  status: OrderStatus;
  rejectReason: string | null;
  cancelReason: string | null;
  createdAt: string;
}

export interface Trade {
  tradeId: number;
  price: number;
  quantity: number;
  aggressorSide: 'buy' | 'sell';
  executedAt: string;
}
