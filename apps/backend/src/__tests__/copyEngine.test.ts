import type { CopyOrder, WsEventName } from '@polymirror/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionAdapter, SubmitResult, VerifyResult } from '../adapters/execution/types';
import { AppError } from '../lib/errors';
import { CopyEngine } from '../modules/copy/engine';
import { MemoryCopyStore } from '../modules/copy/memoryStore';
import type { CopyEventsPort, MarketPort, StoredTrade } from '../modules/copy/types';

const T0 = 1_800_000_000_000;
const USER = 'user_1';

class FakeExecution implements ExecutionAdapter {
  kind: 'demo' | 'assisted' = 'demo';
  supportsProgrammaticExecution = true;
  balance: number | null = 1_000;
  submitResult: SubmitResult | Error = { status: 'accepted', externalOrderId: 'ext-1' };
  verifyResult: VerifyResult = { status: 'confirmed', fillPrice: 0.62, filledShares: 16.1, transactionHash: '0xtx' };
  submitted: CopyOrder[] = [];
  async getBalance() {
    return this.balance;
  }
  async submit(order: CopyOrder) {
    this.submitted.push(order);
    if (this.submitResult instanceof Error) throw this.submitResult;
    return this.submitResult;
  }
  async verify() {
    return this.verifyResult;
  }
}

class FakeEvents implements CopyEventsPort {
  events: Array<{ userId: string; event: WsEventName; data: unknown }> = [];
  notifications: Array<{ userId: string; type: string; message: string }> = [];
  emit(userId: string, event: WsEventName, data: unknown) {
    this.events.push({ userId, event, data });
  }
  async notify(userId: string, n: { type: string; message: string }) {
    this.notifications.push({ userId, type: n.type, message: n.message });
  }
  names() {
    return this.events.map((e) => e.event);
  }
}

const market: MarketPort & { price: number | null; active: boolean | null } = {
  price: 0.61,
  active: true,
  async getCurrentPrice() {
    return this.price;
  },
  async getMarketState() {
    return { active: this.active, url: 'https://polymarket.com/event/btc', category: 'Crypto' };
  },
};

let tradeSeq = 0;
function trade(p: Partial<StoredTrade> = {}): StoredTrade {
  tradeSeq++;
  return {
    id: `fill-${tradeSeq}`,
    dbId: `trade-${tradeSeq}`,
    traderId: 'trader-1',
    traderAddress: '0xabcd000000000000000000000000000000001234',
    conditionId: 'cond-1',
    tokenId: 'tok-yes',
    side: 'BUY',
    size: 163_934.43,
    price: 0.61,
    notional: 100_000,
    timestamp: now - 5_000,
    marketTitle: 'Will BTC reach $120,000?',
    marketSlug: 'btc-120k',
    eventSlug: 'btc-120k',
    outcome: 'Yes',
    outcomeIndex: 0,
    transactionHash: '0xwhale',
    category: 'Crypto',
    ...p,
  };
}

let now = T0;
let store: MemoryCopyStore;
let exec: FakeExecution;
let events: FakeEvents;
let engine: CopyEngine;

function setup() {
  now = T0;
  store = new MemoryCopyStore(() => now);
  exec = new FakeExecution();
  events = new FakeEvents();
  market.price = 0.61;
  market.active = true;
  engine = new CopyEngine(store, exec, market, events, { maxTradeAgeMs: 180_000, assistedVerifyTimeoutMs: 1_800_000 }, () => now);
}

async function proposeTrade(p: Partial<StoredTrade> = {}) {
  const t = trade(p);
  store.trades.set(t.dbId, t);
  await engine.onWhaleTrade(t, [USER]);
  return [...store.orders.values()].find((o) => o.sourceTradeId === t.dbId)!;
}

const confirm = (id: string, amount = 10, key = `idem-${id}-${Math.random()}`) =>
  engine.confirm(USER, { copyOrderId: id, expectedAmount: amount, idempotencyKey: key });

beforeEach(setup);

describe('copy proposals', () => {
  it('proposes the user amount, never the whale amount', async () => {
    const order = await proposeTrade();
    expect(order.status).toBe('PENDING');
    expect(order.amount).toBe(10);
    expect(order.whaleSize).toBe(100_000);
    expect(events.names()).toContain('copy.pending');
    expect(events.notifications.map((n) => n.type)).toContain('WHALE_TRADE');
    expect(exec.submitted).toHaveLength(0); // manual mode: nothing executes without confirmation
  });

  it('uses percentage sizing with limits', async () => {
    store.setSettings(USER, { sizingMode: 'PERCENTAGE', percentage: 0.01 });
    expect((await proposeTrade()).amount).toBe(10);
    store.setSettings(USER, { sizingMode: 'PERCENTAGE', percentage: 1 });
    expect((await proposeTrade()).amount).toBe(20); // clamped to maxPerTrade
  });

  it('prevents duplicate proposals for the same whale trade', async () => {
    const t = trade();
    store.trades.set(t.dbId, t);
    await engine.onWhaleTrade(t, [USER]);
    await engine.onWhaleTrade(t, [USER]);
    await engine.propose(USER, t);
    expect([...store.orders.values()].filter((o) => o.sourceTradeId === t.dbId)).toHaveLength(1);
    expect(events.names().filter((e) => e === 'copy.pending')).toHaveLength(1);
  });

  it('silently skips trades outside the user filters', async () => {
    const small = await proposeTrade({ notional: 5_000 });
    expect(small.status).toBe('SKIPPED');
    expect(small.failureReason).toMatch(/below your minimum/);
    const sell = await proposeTrade({ side: 'SELL' });
    expect(sell.status).toBe('SKIPPED');
    store.setSettings(USER, { allowedCategories: ['Politics'] });
    expect((await proposeTrade()).status).toBe('SKIPPED');
    expect(events.names()).not.toContain('copy.pending');
  });

  it('cancels proposals blocked by a limit and notifies', async () => {
    store.setSettings(USER, { maxDailyAmount: 20, maxPerTrade: 20 });
    const a = await proposeTrade();
    await confirm(a.id);
    const b = await proposeTrade();
    await confirm(b.id);
    const c = await proposeTrade();
    expect(c.status).toBe('CANCELLED');
    expect(events.notifications.map((n) => n.type)).toContain('DAILY_LIMIT_REACHED');
  });
});

describe('copy confirmation', () => {
  it('executes only after explicit confirmation and confirms only after verification', async () => {
    const order = await proposeTrade();
    const result = await confirm(order.id);
    expect(exec.submitted).toHaveLength(1);
    expect(exec.submitted[0]!.amount).toBe(10);
    expect(result.status).toBe('CONFIRMED');
    expect(result.transactionHash).toBe('0xtx');
    expect(result.externalOrderId).toBe('ext-1');
    expect(events.names()).toEqual(expect.arrayContaining(['copy.executing', 'copy.success']));
    expect(store.audits.map((a) => a.action)).toEqual(expect.arrayContaining(['copy.confirm', 'copy.confirmed']));
  });

  it('does not mark an accepted-but-unverified order as copied', async () => {
    exec.verifyResult = { status: 'pending' };
    const order = await proposeTrade();
    const result = await confirm(order.id);
    expect(result.status).toBe('SUBMITTED');
    expect(events.names()).not.toContain('copy.success');
  });

  it('is idempotent for the same confirmation key', async () => {
    const order = await proposeTrade();
    const first = await confirm(order.id, 10, 'same-key-123');
    const second = await confirm(order.id, 10, 'same-key-123');
    expect(second.id).toBe(first.id);
    expect(exec.submitted).toHaveLength(1);
  });

  it('rejects a second confirmation with a different key (no double copy)', async () => {
    const order = await proposeTrade();
    await confirm(order.id, 10, 'key-a-123456');
    await expect(confirm(order.id, 10, 'key-b-123456')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(exec.submitted).toHaveLength(1);
  });

  it('serializes concurrent confirmations of the same order', async () => {
    const order = await proposeTrade();
    const results = await Promise.allSettled([confirm(order.id, 10, 'k1-aaaaaaa'), confirm(order.id, 10, 'k2-bbbbbbb')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(exec.submitted).toHaveLength(1);
  });

  it('rejects when the reviewed amount no longer matches', async () => {
    const order = await proposeTrade();
    await expect(confirm(order.id, 12)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(exec.submitted).toHaveLength(0);
  });

  it('re-checks limits at execution time and does not send the order on violation', async () => {
    const order = await proposeTrade();
    market.price = 0.75; // price ran away: slippage > 3%
    await expect(confirm(order.id)).rejects.toSatisfy(
      (e: unknown) => e instanceof AppError && e.code === 'LIMIT_VIOLATION' && Array.isArray(e.details),
    );
    expect(exec.submitted).toHaveLength(0);
    expect((await store.getOrder(order.id))!.status).toBe('PENDING');
  });

  it('enforces the daily limit across orders', async () => {
    store.setSettings(USER, { maxDailyAmount: 25, maxPerTrade: 20 });
    const a = await proposeTrade();
    const b = await proposeTrade();
    const c = await proposeTrade();
    await confirm(a.id);
    await confirm(b.id);
    await expect(confirm(c.id)).rejects.toMatchObject({ code: 'LIMIT_VIOLATION' });
    expect(exec.submitted).toHaveLength(2);
  });

  it('enforces max open positions and insufficient balance', async () => {
    store.setSettings(USER, { maxOpenPositions: 1 });
    const a = await proposeTrade();
    const b = await proposeTrade();
    await confirm(a.id);
    await expect(confirm(b.id)).rejects.toMatchObject({ code: 'LIMIT_VIOLATION' });

    setup();
    exec.balance = 5;
    const c = await proposeTrade();
    expect(c.status).toBe('CANCELLED');
    expect(events.notifications.map((n) => n.type)).toContain('INSUFFICIENT_BALANCE');
  });

  it('refuses expired proposals', async () => {
    const order = await proposeTrade();
    now += 10 * 60_000;
    await expect(confirm(order.id)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await store.getOrder(order.id))!.status).toBe('CANCELLED');
    expect(exec.submitted).toHaveLength(0);
  });

  it('only the owner can confirm or skip', async () => {
    const order = await proposeTrade();
    await expect(engine.confirm('someone-else', { copyOrderId: order.id, expectedAmount: 10, idempotencyKey: 'x-12345678' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(engine.skip('someone-else', order.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('skips a pending order', async () => {
    const order = await proposeTrade();
    const skipped = await engine.skip(USER, order.id, 'not convinced');
    expect(skipped.status).toBe('SKIPPED');
    await expect(confirm(order.id)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('failed orders', () => {
  it('marks a rejected order as FAILED with the reason and notifies', async () => {
    exec.submitResult = { status: 'rejected', reason: 'Insufficient liquidity' };
    const order = await proposeTrade();
    const result = await confirm(order.id);
    expect(result.status).toBe('FAILED');
    expect(result.failureReason).toBe('Insufficient liquidity');
    expect(events.names()).toContain('copy.failed');
    expect(events.notifications.map((n) => n.type)).toContain('COPY_FAILED');
  });

  it('treats a thrown venue error as a failure and does not count it against limits', async () => {
    exec.submitResult = new Error('boom');
    const order = await proposeTrade();
    expect((await confirm(order.id)).status).toBe('FAILED');
    const exposure = await store.exposure(USER, 0);
    expect(exposure.dailyUsed).toBe(0);
    expect(exposure.openPositions).toBe(0);
  });

  it('fails a verification failure', async () => {
    exec.verifyResult = { status: 'failed', reason: 'Order not found' };
    const order = await proposeTrade();
    expect((await confirm(order.id)).status).toBe('FAILED');
  });
});

describe('automatic mode', () => {
  it('executes automatically only when explicitly enabled and supported', async () => {
    store.setSettings(USER, { mode: 'AUTOMATIC', confirmationRequired: false });
    const order = await proposeTrade();
    expect((await store.getOrder(order.id))!.status).toBe('CONFIRMED');
    expect(store.audits.map((a) => a.action)).toContain('copy.auto_execute');
  });

  it('never executes automatically while confirmation is required', async () => {
    store.setSettings(USER, { mode: 'AUTOMATIC', confirmationRequired: true });
    const order = await proposeTrade();
    expect((await store.getOrder(order.id))!.status).toBe('PENDING');
    expect(exec.submitted).toHaveLength(0);
  });

  it('never executes automatically on venues without programmatic execution', async () => {
    exec.supportsProgrammaticExecution = false;
    store.setSettings(USER, { mode: 'AUTOMATIC', confirmationRequired: false });
    await proposeTrade();
    expect(exec.submitted).toHaveLength(0);
  });

  it('leaves the order for review when a check is unknown (strict mode)', async () => {
    store.setSettings(USER, { mode: 'AUTOMATIC', confirmationRequired: false });
    market.price = null;
    const order = await proposeTrade();
    expect((await store.getOrder(order.id))!.status).toBe('PENDING');
    expect(store.audits.map((a) => a.action)).toContain('copy.auto_blocked');
  });
});

describe('assisted execution and maintenance', () => {
  beforeEach(() => {
    exec.kind = 'assisted';
    exec.supportsProgrammaticExecution = false;
    exec.balance = null;
    exec.submitResult = { status: 'awaiting_user' };
  });

  it('requires a wallet address to verify fills', async () => {
    const order = await proposeTrade();
    await expect(confirm(order.id)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('stays SUBMITTED until a matching fill is verified', async () => {
    store.setSettings(USER, { walletAddress: '0x1111111111111111111111111111111111111111' });
    exec.verifyResult = { status: 'pending' };
    const order = await proposeTrade();
    const submitted = await confirm(order.id);
    expect(submitted.status).toBe('SUBMITTED');
    exec.verifyResult = { status: 'confirmed', fillPrice: 0.6, filledShares: 16, filledAmount: 9.6, transactionHash: '0xuser' };
    const verified = await engine.verify(USER, order.id);
    expect(verified.status).toBe('CONFIRMED');
    expect(verified.amount).toBe(9.6);
    expect(verified.transactionHash).toBe('0xuser');
  });

  it('fails SUBMITTED orders after the verification timeout and expires stale proposals', async () => {
    store.setSettings(USER, { walletAddress: '0x1111111111111111111111111111111111111111' });
    exec.verifyResult = { status: 'pending' };
    const submitted = await proposeTrade();
    await confirm(submitted.id);
    const stale = await proposeTrade();
    now += 31 * 60_000;
    const res = await engine.runMaintenance();
    expect(res.failed).toBe(1);
    expect(res.expired).toBe(1);
    expect((await store.getOrder(submitted.id))!.status).toBe('FAILED');
    expect((await store.getOrder(stale.id))!.status).toBe('CANCELLED');
  });
});

describe('mark to market', () => {
  it('updates P/L of confirmed copies', async () => {
    const order = await proposeTrade();
    await confirm(order.id); // 16.1 shares at 0.62
    market.price = 0.7;
    await engine.runMaintenance();
    const after = (await store.getOrder(order.id))!;
    expect(after.currentPrice).toBe(0.7);
    expect(after.pnl).toBeCloseTo(16.1 * 0.7 - 10, 6);
  });
});

vi.setConfig({ testTimeout: 10_000 });
