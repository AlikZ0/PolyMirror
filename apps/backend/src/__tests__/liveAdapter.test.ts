import { describe, expect, it } from 'vitest';
import { LivePolymarketAdapter } from '../adapters/polymarket/live/liveAdapter';
import { parseMarkets, parsePositions, parseTrades, parseUserStats, unwrapPage } from '../adapters/polymarket/live/parsers';
import { UpstreamError } from '../lib/errors';

const TRADER = '0x6af75d4e4aaf700450efbac3708cce1665810ff1';
const tradeRow = {
  proxy_wallet: TRADER,
  side: 'BUY',
  token_id: '1234',
  condition_id: '0x' + 'a'.repeat(64),
  size: '1000',
  price: 0.61,
  timestamp: 1_760_000_000,
  title: 'Will BTC reach $120,000?',
  slug: 'btc-120k',
  event_slug: 'btc-120k-event',
  outcome: 'Yes',
  outcome_index: 0,
  name: 'whale',
  pseudonym: '',
  profile_image: '',
  transaction_hash: '0xabc',
};

function mockFetch(routes: Record<string, (url: URL) => { status?: number; body?: unknown; headers?: Record<string, string> }>) {
  const calls: string[] = [];
  const fetchImpl = async (input: string) => {
    const url = new URL(input);
    calls.push(`${url.host}${url.pathname}?${url.searchParams.toString()}`);
    const handler = routes[url.pathname];
    if (!handler) return new Response('not found', { status: 404 });
    const r = handler(url);
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: r.headers });
  };
  return { fetchImpl, calls };
}

const opts = { dataUrl: 'https://data.test', gammaUrl: 'https://gamma.test', clobUrl: 'https://clob.test', webUrl: 'https://polymarket.com', maxRps: 1000 };

describe('Data API v2 parsers', () => {
  it('parses trades: decimal strings, seconds -> ms, empty strings -> null', () => {
    const { fills, profiles } = parseTrades([tradeRow, { garbage: true }]);
    expect(fills).toHaveLength(1);
    const f = fills[0]!;
    expect(f.size).toBe(1000);
    expect(f.notional).toBeCloseTo(610);
    expect(f.timestamp).toBe(1_760_000_000_000);
    expect(f.traderAddress).toBe(TRADER);
    expect(profiles.get(TRADER)).toEqual({ userName: 'whale', profileImage: null });
  });

  it('unwraps the v2 envelope and cursor', () => {
    expect(unwrapPage({ data: [1, 2], pagination: { has_more: true, next_cursor: 'abc' } })).toEqual({ items: [1, 2], nextCursor: 'abc' });
    expect(unwrapPage({ data: [], pagination: { has_more: false, next_cursor: null } }).nextCursor).toBeNull();
    expect(unwrapPage([1]).items).toEqual([1]);
  });

  it('parses positions without inventing values', () => {
    const rows = [
      { proxy_wallet: TRADER, token_id: '1', condition_id: 'c', avg_price: '0.4', total_cost_usdc: '400', total_size: '1000', realized_pnl: '600', total_pnl: '600', current_price: '1', status: 'REDEEMABLE', last_event_at: 1_760_000_100, title: 't' },
      { proxy_wallet: TRADER, token_id: '2', condition_id: 'c', avg_price: '0.5', total_cost_usdc: '0', total_pnl: '0', status: 'OPEN' },
      { proxy_wallet: TRADER, token_id: '3', condition_id: 'c', avg_price: '0.5', total_cost_usdc: '50', total_pnl: '-5', realized_pnl: '0', status: 'OPEN' },
    ];
    const positions = parsePositions(rows, new Map([['1', 123]]));
    expect(positions).toHaveLength(2);
    expect(positions[0]).toMatchObject({ status: 'RESOLVED', cost: 400, pnl: 600, roi: 1.5, openedAt: 123, closedAt: 1_760_000_100_000, exitPrice: 1 });
    expect(positions[1]).toMatchObject({ status: 'OPEN', exitPrice: null, openedAt: null, closedAt: null });
  });

  it('parses user stats and gamma markets (JSON-string arrays, categories from tags only)', () => {
    expect(parseUserStats({ data: { proxy_wallet: TRADER, trades: 42, biggest_win: '1000.5', views: 1, join_date: '2024-01-02T00:00:00Z' } })).toEqual({
      marketsTraded: 42,
      biggestWin: 1000.5,
      joinDate: Date.parse('2024-01-02T00:00:00Z'),
    });
    const markets = parseMarkets(
      [
        { conditionId: 'c1', question: 'Q1', slug: 's1', outcomes: '["Yes","No"]', clobTokenIds: '["1","2"]', outcomePrices: '["0.6","0.4"]', tags: [{ label: 'Crypto' }], events: [{ slug: 'e1' }], active: true, closed: false },
        { conditionId: 'c2', question: 'Q2', tags: [{ label: 'Some Niche Tag' }] },
      ],
      'https://polymarket.com',
    );
    expect(markets[0]).toMatchObject({ category: 'Crypto', tokenIds: ['1', '2'], outcomePrices: [0.6, 0.4], url: 'https://polymarket.com/event/e1' });
    expect(markets[1]!.category).toBeNull();
  });
});

describe('LivePolymarketAdapter', () => {
  it('queries /v2/trades with user, takerOnly=false and paginates by cursor', async () => {
    let page = 0;
    const { fetchImpl, calls } = mockFetch({
      '/v2/trades': () => {
        page++;
        return page === 1
          ? { body: { data: [tradeRow], pagination: { limit: 500, offset: 0, has_more: true, next_cursor: 'next' } } }
          : { body: { data: [{ ...tradeRow, transaction_hash: '0xdef', timestamp: 1_760_000_500 }], pagination: { limit: 500, offset: 0, has_more: false, next_cursor: null } } };
      },
      '/markets/keyset': () => ({ body: { markets: [{ conditionId: tradeRow.condition_id, question: 'Q', tags: [{ label: 'Crypto' }] }] } }),
    });
    const adapter = new LivePolymarketAdapter({ ...opts, fetchImpl });
    const fills = await adapter.getTraderFills(TRADER, { since: 1_700_000_000_000 });
    expect(fills).toHaveLength(2);
    expect(fills[0]!.timestamp).toBeGreaterThan(fills[1]!.timestamp);
    expect(fills.every((f) => f.category === 'Crypto')).toBe(true);
    expect(calls[0]).toContain(`user=${TRADER}`);
    expect(calls[0]).toContain('takerOnly=false');
    expect(calls[0]).toContain('start=1700000000');
    expect(calls[1]).toContain('cursor=next');
  });

  it('retries on 429 honoring Retry-After, then succeeds', async () => {
    let n = 0;
    const { fetchImpl } = mockFetch({
      '/midpoint': () => (++n === 1 ? { status: 429, headers: { 'retry-after': '0' } } : { body: { mid: '0.55' } }),
    });
    const adapter = new LivePolymarketAdapter({ ...opts, fetchImpl });
    expect(await adapter.getCurrentPrice('1')).toBe(0.55);
    expect(n).toBe(2);
  });

  it('surfaces persistent upstream errors as UpstreamError', async () => {
    const { fetchImpl } = mockFetch({ '/v2/user-stats': () => ({ status: 400, body: { error: 'bad' } }) });
    const adapter = new LivePolymarketAdapter({ ...opts, fetchImpl });
    await expect(adapter.getTraderStats(TRADER)).rejects.toBeInstanceOf(UpstreamError);
  });

  it('builds official market URLs', () => {
    const adapter = new LivePolymarketAdapter(opts);
    expect(adapter.marketUrl({ eventSlug: 'e', marketSlug: 'm' })).toBe('https://polymarket.com/event/e');
    expect(adapter.marketUrl({ eventSlug: null, marketSlug: null })).toBeNull();
  });
});
