import { formatMinor, parseMinor, type PlaceOrderInput } from '@tickbook/shared';
import { useEffect, useState, type FormEvent } from 'react';
import type { Instrument } from '../api/types.js';

type Side = 'buy' | 'sell';
type Kind = 'limit' | 'market';
type Tif = 'GTC' | 'IOC' | 'FOK';

interface Props {
  readonly instrument: Instrument;
  readonly accountId: string;
  readonly prefillPrice?: number | null;
  readonly disabled?: boolean;
  readonly onSubmit: (input: PlaceOrderInput) => Promise<string>;
}

/** Client-side mirror of the engine's static rules, for instant feedback only (the server decides). */
export const ticketError = (
  instrument: Pick<Instrument, 'tickSize' | 'lotSize' | 'maxOrderQty'>,
  kind: Kind,
  priceText: string,
  qtyText: string,
): string | null => {
  const qty = Number(qtyText);
  if (!Number.isSafeInteger(qty) || qty <= 0) return 'Quantity must be a positive whole number';
  if (qty % instrument.lotSize !== 0)
    return `Quantity must be a multiple of the lot size (${instrument.lotSize})`;
  if (qty > instrument.maxOrderQty)
    return `Quantity exceeds the maximum of ${instrument.maxOrderQty}`;
  if (kind === 'market') return null;
  const price = parseMinor(priceText);
  if (price === null || price <= 0) return 'Enter a price such as 100.25';
  if (price % instrument.tickSize !== 0)
    return `Price must be a multiple of the tick size (${formatMinor(instrument.tickSize)})`;
  return null;
};

export const OrderTicket = ({ instrument, accountId, prefillPrice, disabled, onSubmit }: Props) => {
  const [side, setSide] = useState<Side>('buy');
  const [kind, setKind] = useState<Kind>('limit');
  const [tif, setTif] = useState<Tif>('GTC');
  const [priceText, setPriceText] = useState('');
  const [qtyText, setQtyText] = useState(String(instrument.lotSize * 10));
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (prefillPrice != null) setPriceText(formatMinor(prefillPrice).replace(/,/g, ''));
  }, [prefillPrice]);

  useEffect(() => {
    if (kind === 'market' && tif === 'GTC') setTif('IOC');
  }, [kind, tif]);

  const error = ticketError(instrument, kind, priceText, qtyText);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (error) return;
    setBusy(true);
    setMessage(null);
    try {
      const price = kind === 'limit' ? (parseMinor(priceText) as number) : undefined;
      const text = await onSubmit({
        accountId,
        symbol: instrument.symbol,
        side,
        type: kind,
        timeInForce: tif,
        quantity: Number(qtyText),
        ...(price !== undefined ? { price } : {}),
      });
      setMessage({ tone: 'ok', text });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Order failed' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="ticket" onSubmit={submit} aria-label="Order ticket">
      <div className="segmented" role="group" aria-label="Side">
        {(['buy', 'sell'] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={`seg ${s} ${side === s ? 'active' : ''}`}
            aria-pressed={side === s}
            onClick={() => setSide(s)}
          >
            {s === 'buy' ? 'Buy' : 'Sell'}
          </button>
        ))}
      </div>
      <label>
        Type
        <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          <option value="limit">Limit</option>
          <option value="market">Market</option>
        </select>
      </label>
      <label>
        Time in force
        <select value={tif} onChange={(e) => setTif(e.target.value as Tif)}>
          {kind === 'limit' && <option value="GTC">GTC (rest until cancelled)</option>}
          <option value="IOC">IOC (fill now, cancel rest)</option>
          <option value="FOK">FOK (all or nothing)</option>
        </select>
      </label>
      {kind === 'limit' && (
        <label>
          Price ({instrument.currency})
          <input
            inputMode="decimal"
            value={priceText}
            onChange={(e) => setPriceText(e.target.value)}
            placeholder="100.00"
          />
        </label>
      )}
      <label>
        Quantity
        <input inputMode="numeric" value={qtyText} onChange={(e) => setQtyText(e.target.value)} />
      </label>
      <p className="hint">
        Tick {formatMinor(instrument.tickSize)} · Lot {instrument.lotSize}
      </p>
      {error && priceText + qtyText !== '' && <p className="field-error">{error}</p>}
      <button
        type="submit"
        className={`primary ${side}`}
        disabled={disabled || busy || error !== null}
      >
        {busy ? 'Sending…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${instrument.symbol}`}
      </button>
      {message && (
        <p role="status" className={`notice ${message.tone}`}>
          {message.text}
        </p>
      )}
    </form>
  );
};
