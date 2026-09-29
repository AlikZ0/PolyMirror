import { describe, expect, it } from 'vitest';
import { DemoPolymarketAdapter } from '../adapters/polymarket/demo/demoAdapter';
import { DemoExecutionAdapter } from '../adapters/execution/demoExecution';
import { originAllowed } from '../app';
import { WsHub } from '../websocket/hub';

const START = 1_800_000_000_000;

describe('demo data source', () => {
  it('is deterministic for the same start time', async () => {
    const a = new DemoPolymarketAdapter(() => START, START);
    const b = new DemoPolymarketAdapter(() => START, START);
    expect(a.world.traders.map((t) => t.address)).toEqual(b.world.traders.map((t) => t.address));
    const addr = a.world.traders[0]!.address;
    expect(await a.getTraderFills(addr)).toEqual(await b.getTraderFills(addr));
  });

  it('produces live fills only after start and stable across polls', () => {
    const d = new DemoPolymarketAdapter(() => START, START);
    const t = d.world.traders[0]!;
    const window1 = d.world.liveFills(t.address, START, START + 3_600_000);
    const window2 = d.world.liveFills(t.address, START, START + 3_600_000);
    expect(window1.length).toBeGreaterThan(0);
    expect(window1).toEqual(window2);
    expect(window1.every((f) => f.timestamp >= START && f.notional >= 10_000)).toBe(true);
    expect(d.world.liveFills(t.address, START - 3_600_000, START - 1)).toHaveLength(0);
  });

  it('never exposes a Polymarket URL for demo markets and simulates execution locally', async () => {
    const d = new DemoPolymarketAdapter(() => START, START);
    expect(d.marketUrl()).toBeNull();
    const exec = new DemoExecutionAdapter(async () => 0.5, { rejectRate: 0 });
    expect(exec.kind).toBe('demo');
    const res = await exec.submit({ id: 'o1', amount: 10, tokenId: 't' } as never);
    expect(res.status).toBe('accepted');
    expect((await exec.verify({ id: 'o1', amount: 10 } as never)).status).toBe('confirmed');
    expect((await exec.verify({ id: 'unknown', amount: 10 } as never)).status).toBe('failed');
  });

  it('leaderboard ranks by volume', async () => {
    const d = new DemoPolymarketAdapter(() => START, START);
    const rows = await d.listLeaderboard({ window: 'month', sortBy: 'VOLUME', limit: 10 });
    expect(rows).toHaveLength(10);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1]!.volume!).toBeGreaterThanOrEqual(rows[i]!.volume!);
  });
});

describe('infrastructure', () => {
  it('matches CORS origin patterns', () => {
    expect(originAllowed('chrome-extension://abcdef', ['chrome-extension://*'])).toBe(true);
    expect(originAllowed('https://evil.com', ['chrome-extension://*'])).toBe(false);
    expect(originAllowed('chrome-extension://a/b', ['chrome-extension://*'])).toBe(false);
  });

  it('ws hub sends only to the target user with increasing seq', () => {
    const hub = new WsHub();
    const sent: Record<string, string[]> = { a: [], b: [] };
    const sock = (k: 'a' | 'b') => ({ readyState: 1, send: (d: string) => sent[k]!.push(d), close: () => undefined });
    const a = sock('a');
    hub.add('u1', a);
    hub.add('u2', sock('b'));
    hub.emit('u1', 'connection.status', { status: 'authenticated', serverTime: 1 });
    hub.emit('u1', 'connection.status', { status: 'authenticated', serverTime: 2 });
    expect(sent.a!.map((m) => JSON.parse(m).seq)).toEqual([1, 2]);
    expect(sent.b).toHaveLength(0);
    hub.remove('u1', a);
    hub.emit('u1', 'connection.status', { status: 'authenticated', serverTime: 3 });
    expect(sent.a).toHaveLength(2);
  });
});
