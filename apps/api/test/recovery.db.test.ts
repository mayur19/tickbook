import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { loadMigrations, migrate } from '../src/db/migrate.js';
import { reconcile, recoverVenue } from '../src/venue/recovery.js';
import { authed, createContext, createFirm, login, type TestContext } from './helpers.js';

let ctx: TestContext;

beforeEach(async () => {
  if (ctx) await ctx.close();
  ctx = await createContext();
});
afterAll(async () => ctx?.close());

describe('journal recovery', () => {
  it('rebuilds identical books from the journal after a restart', async () => {
    const a = await createFirm(ctx.pool, 'Rec A', {
      cash: 10_000_000,
      positions: { TBK: 2_000 },
      instruments: ctx.instruments,
    });
    const b = await createFirm(ctx.pool, 'Rec B', {
      cash: 10_000_000,
      positions: { TBK: 2_000 },
      instruments: ctx.instruments,
    });
    const sa = await login(ctx.app, a.emails.owner);
    const sb = await login(ctx.app, b.emails.owner);
    const ids: string[] = [];
    const prices = [990, 995, 1_000, 1_005, 1_010];
    for (let i = 0; i < 30; i += 1) {
      const buyer = i % 3 === 0;
      const res = await authed(ctx.app, buyer ? sa : sb, 'POST', '/api/v1/orders', {
        accountId: buyer ? a.accountId : b.accountId,
        symbol: 'TBK',
        side: buyer ? 'buy' : 'sell',
        type: i % 7 === 0 ? 'market' : 'limit',
        timeInForce: i % 7 === 0 ? 'IOC' : i % 5 === 0 ? 'IOC' : 'GTC',
        ...(i % 7 === 0 ? {} : { price: prices[i % prices.length] }),
        quantity: 10 * ((i % 4) + 1),
      });
      if (res.statusCode === 201) ids.push(res.json().data.order.id);
    }
    for (const id of ids.slice(0, 4)) await authed(ctx.app, sa, 'DELETE', `/api/v1/orders/${id}`);

    const live = ctx.venue.view('TBK')!;
    const { venue, report } = await recoverVenue(ctx.pool, 20);
    const recovered = venue.view('TBK')!;
    expect(recovered.state).toEqual(live.state);
    expect(recovered.lastPrice).toBe(live.lastPrice);
    expect(report[0]).toMatchObject({ symbol: 'TBK', commands: live.state.seq });
    expect(await reconcile(ctx.pool, venue)).toEqual([]);
  });

  it('reports disagreement between book and order table', async () => {
    const a = await createFirm(ctx.pool, 'Rec C', { instruments: ctx.instruments });
    const s = await login(ctx.app, a.emails.owner);
    const res = await authed(ctx.app, s, 'POST', '/api/v1/orders', {
      accountId: a.accountId,
      symbol: 'TBK',
      side: 'buy',
      type: 'limit',
      price: 900,
      quantity: 10,
    });
    const id = res.json().data.order.id;
    await ctx.pool.query('UPDATE orders SET remaining_quantity = 5 WHERE id = $1', [id]);
    expect(await reconcile(ctx.pool, ctx.venue)).toEqual([
      expect.stringContaining('remaining 10 != 5'),
    ]);
    await ctx.pool.query("UPDATE orders SET status = 'cancelled' WHERE id = $1", [id]);
    expect(await reconcile(ctx.pool, ctx.venue)).toEqual([
      expect.stringContaining('not open in the database'),
    ]);
    await ctx.pool.query("UPDATE orders SET status = 'new' WHERE id = $1", [id]);
    await ctx.pool.query('DELETE FROM journal');
    const { venue } = await recoverVenue(ctx.pool, 20);
    expect(await reconcile(ctx.pool, venue)).toEqual([
      expect.stringContaining('missing from the book'),
    ]);
  });

  it('refuses to start from a journal with a sequence gap', async () => {
    await ctx.pool.query(
      `INSERT INTO journal (instrument_id, seq, command) VALUES ($1, 2, '{"kind":"cancel","orderId":"x","accountId":"y","ts":"t"}')`,
      [ctx.instruments.get('TBK')],
    );
    await expect(recoverVenue(ctx.pool, 20)).rejects.toThrow(/Journal gap for TBK/);
    await ctx.pool.query('DELETE FROM journal');
  });
});

describe('migration runner', () => {
  it('is idempotent and verifies checksums of applied migrations', async () => {
    const again = await migrate(ctx.pool);
    expect(again.applied).toEqual([]);
    expect(again.skipped).toEqual(['0001', '0002']);

    const dir = await mkdtemp(path.join(tmpdir(), 'tb-mig-'));
    await writeFile(path.join(dir, '0001_foundation.sql'), '-- tampered');
    await expect(migrate(ctx.pool, dir)).rejects.toThrow(/Checksum mismatch/);
  });

  it('loads migrations in order and ignores unrelated files', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'tb-mig-'));
    await writeFile(path.join(dir, '0002_b.sql'), 'SELECT 2;');
    await writeFile(path.join(dir, '0001_a.sql'), 'SELECT 1;');
    await writeFile(path.join(dir, 'README.md'), 'x');
    const list = await loadMigrations(dir);
    expect(list.map((m) => m.version)).toEqual(['0001', '0002']);
  });

  it('rolls back and reports a failing migration', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'tb-mig-'));
    const real = await loadMigrations();
    for (const m of real) await writeFile(path.join(dir, `${m.version}_${m.name}.sql`), m.sql);
    await writeFile(
      path.join(dir, '0099_broken.sql'),
      'CREATE TABLE tb_broken (id int); SELECT nonsense_fn();',
    );
    await expect(migrate(ctx.pool, dir)).rejects.toThrow(/0099_broken failed/);
    const { rows } = await ctx.pool.query("SELECT to_regclass('tb_broken') AS t");
    expect(rows[0].t).toBeNull();
  });
});
