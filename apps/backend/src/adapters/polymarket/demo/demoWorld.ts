import { DAY_MS, fillId, reconstructPositions } from '@polymirror/shared';
import type { MarketInfo, TradeFill, TraderPosition } from '@polymirror/shared';
import { Rng, unitHash } from './prng';

/**
 * Generated DEMO universe: traders, markets, 90 days of fills and a deterministic live stream.
 * Everything here is synthetic and must only be served in DEMO MODE.
 */

export interface DemoMarket extends MarketInfo {
  /** Resolution time (ms) and winning outcome index, if the market resolves within the window. */
  resolvesAt: number | null;
  winningIndex: number | null;
  basePrice: number;
  phase: number;
  periodMs: number;
}

export interface DemoTrader {
  address: string;
  userName: string;
  /** Median trade notional (USDC). */
  medianSize: number;
  /** 0..1 probability to pick the eventually-winning side / favorable exit. */
  skill: number;
  /** Probability per live slot to trade. */
  liveRate: number;
  favoriteCategories: string[];
}

const DEMO_CATEGORIES = ['Crypto', 'Politics', 'Sports', 'Economy', 'Pop Culture'] as const;

const MARKET_TEMPLATES: Record<(typeof DEMO_CATEGORIES)[number], string[]> = {
  Crypto: [
    'Will BTC reach $120,000 by month end?',
    'Will ETH close above $5,000 this quarter?',
    'Will SOL flip BNB in market cap?',
    'Will a spot XRP ETF be approved?',
    'Will BTC dip below $80,000 this month?',
    'Will ETH/BTC ratio exceed 0.05?',
  ],
  Politics: [
    'Will the incumbent win the next general election?',
    'Will the Senate pass the budget bill?',
    'Will voter turnout exceed 65%?',
    'Will the party leader resign before year end?',
    'Will the trade agreement be signed this quarter?',
  ],
  Sports: [
    'Will the home team win the championship final?',
    'Will the favourite win the Grand Slam?',
    'Will the league MVP be a rookie?',
    'Will the transfer record be broken this window?',
    'Will the underdog reach the semifinals?',
  ],
  Economy: [
    'Will the Fed cut rates at the next meeting?',
    'Will CPI YoY print below 3%?',
    'Will unemployment rise above 4.5%?',
    'Will GDP growth exceed 2% this quarter?',
  ],
  'Pop Culture': [
    'Will the blockbuster gross $1B worldwide?',
    'Will the album debut at #1?',
    'Will the series be renewed for another season?',
  ],
};

export const DEMO_EPOCH_DAYS = 90;
export const LIVE_SLOT_MS = 45_000;

export class DemoWorld {
  readonly markets: DemoMarket[] = [];
  readonly traders: DemoTrader[] = [];
  /** Historical fills generated at start, by trader. */
  private readonly history = new Map<string, TradeFill[]>();
  private readonly marketById = new Map<string, DemoMarket>();
  private readonly marketByToken = new Map<string, { market: DemoMarket; index: number }>();

  constructor(
    readonly startedAt: number,
    readonly seed = 'polymirror-demo-v1',
  ) {
    this.generateMarkets();
    this.generateTraders();
    this.generateHistory();
  }

  // -------------------------------------------------------------------------
  // Prices (deterministic in time)
  // -------------------------------------------------------------------------

  /** Price of outcome `index` of a market at time t. Binary markets: NO = 1 - YES. */
  priceAt(market: DemoMarket, index: number, t: number): number {
    if (market.resolvesAt !== null && t >= market.resolvesAt) {
      return index === market.winningIndex ? 1 : 0;
    }
    let yes =
      market.basePrice +
      0.12 * Math.sin(t / market.periodMs + market.phase) +
      0.04 * Math.sin(t / (market.periodMs / 3.7) + market.phase * 2);
    // Drift toward the winning outcome as resolution approaches.
    if (market.resolvesAt !== null && market.winningIndex !== null) {
      const remaining = market.resolvesAt - t;
      const horizon = 20 * DAY_MS;
      if (remaining < horizon) {
        const target = market.winningIndex === 0 ? 0.97 : 0.03;
        const w = 1 - remaining / horizon;
        yes = yes * (1 - w * 0.8) + target * w * 0.8;
      }
    }
    yes = Math.min(0.98, Math.max(0.02, yes));
    return Math.round((index === 0 ? yes : 1 - yes) * 1000) / 1000;
  }

  tokenPrice(tokenId: string, t: number): number | null {
    const hit = this.marketByToken.get(tokenId);
    return hit ? this.priceAt(hit.market, hit.index, t) : null;
  }

  market(conditionId: string): DemoMarket | undefined {
    return this.marketById.get(conditionId);
  }

  marketForToken(tokenId: string) {
    return this.marketByToken.get(tokenId);
  }

  trader(address: string): DemoTrader | undefined {
    return this.traders.find((t) => t.address === address.toLowerCase());
  }

  // -------------------------------------------------------------------------
  // Fills
  // -------------------------------------------------------------------------

  historicalFills(address: string): TradeFill[] {
    return this.history.get(address.toLowerCase()) ?? [];
  }

  /**
   * Deterministic "live" fills: time is cut into slots; a trader trades in a slot when a hash of
   * (trader, slot) falls under their live rate. Stateless, so any poll window returns the same fills.
   */
  liveFills(address: string, since: number, until: number): TradeFill[] {
    const trader = this.trader(address);
    if (!trader) return [];
    const from = Math.max(since, this.startedAt);
    const out: TradeFill[] = [];
    for (let slot = Math.floor(from / LIVE_SLOT_MS); slot * LIVE_SLOT_MS <= until; slot++) {
      const key = `${this.seed}|live|${trader.address}|${slot}`;
      if (unitHash(key) >= trader.liveRate) continue;
      const ts = slot * LIVE_SLOT_MS + Math.floor(unitHash(`${key}|offset`) * LIVE_SLOT_MS);
      if (ts < from || ts > until) continue;
      const rng = new Rng(key);
      const open = this.markets.filter((m) => m.resolvesAt === null || m.resolvesAt > ts + DAY_MS);
      if (open.length === 0) continue;
      const market = this.pickMarketFor(trader, open, rng);
      const index = rng.chance(0.5) ? 0 : 1;
      const price = this.priceAt(market, index, ts);
      const notional = Math.max(10_500, trader.medianSize * rng.range(0.8, 3));
      out.push(this.makeFill(trader, market, index, 'BUY', notional / price, price, ts));
    }
    return out;
  }

  allFills(address: string, until: number): TradeFill[] {
    return [...this.historicalFills(address), ...this.liveFills(address, this.startedAt, until)];
  }

  positions(address: string, now: number): TraderPosition[] {
    const fills = this.allFills(address, now);
    const resolutions = new Map<string, { price: number; resolvedAt: number | null }>();
    const marks = new Map<string, number>();
    for (const f of fills) {
      const m = this.marketById.get(f.conditionId);
      if (!m) continue;
      const idx = m.tokenIds.indexOf(f.tokenId);
      if (m.resolvesAt !== null && m.resolvesAt <= now) {
        resolutions.set(f.tokenId, {
          price: idx === m.winningIndex ? 1 : 0,
          resolvedAt: m.resolvesAt,
        });
      } else {
        marks.set(f.tokenId, this.priceAt(m, idx, now));
      }
    }
    return reconstructPositions(fills, { resolutions, markPrices: marks }).positions;
  }

  // -------------------------------------------------------------------------
  // Generation
  // -------------------------------------------------------------------------

  private generateMarkets() {
    const rng = new Rng(`${this.seed}|markets`);
    const start = this.startedAt - DEMO_EPOCH_DAYS * DAY_MS;
    let i = 0;
    for (const category of DEMO_CATEGORIES) {
      for (const question of MARKET_TEMPLATES[category]) {
        i += 1;
        const conditionId = `0x${rng.hex(32)}`;
        const slug = `demo-${category.toLowerCase().replace(/\s+/g, '-')}-${i}`;
        // ~45% of markets resolve inside the demo window (past or near future).
        const resolves = rng.chance(0.45);
        const resolvesAt = resolves
          ? Math.floor(start + rng.range(20, DEMO_EPOCH_DAYS + 10) * DAY_MS)
          : null;
        const market: DemoMarket = {
          conditionId,
          question,
          slug,
          eventSlug: slug,
          category,
          active: true,
          closed: false,
          outcomes: ['Yes', 'No'],
          tokenIds: [BigInt(`0x${rng.hex(16)}`).toString(), BigInt(`0x${rng.hex(16)}`).toString()],
          outcomePrices: [],
          url: null,
          resolvesAt,
          winningIndex: resolves ? (rng.chance(0.5) ? 0 : 1) : null,
          basePrice: rng.range(0.2, 0.8),
          phase: rng.range(0, Math.PI * 2),
          periodMs: rng.range(2, 12) * DAY_MS,
        };
        this.markets.push(market);
        this.marketById.set(conditionId, market);
        market.tokenIds.forEach((tokenId, index) =>
          this.marketByToken.set(tokenId, { market, index }),
        );
      }
    }
  }

  private generateTraders() {
    const rng = new Rng(`${this.seed}|traders`);
    const adjectives = [
      'Silent',
      'Iron',
      'Lucky',
      'Deep',
      'Swift',
      'Calm',
      'Bold',
      'Grey',
      'Arctic',
      'Quant',
    ];
    const nouns = ['Whale', 'Orca', 'Shark', 'Kraken', 'Marlin', 'Narwhal', 'Dolphin', 'Manta'];
    for (let i = 0; i < 40; i++) {
      const tier = i < 8 ? 'mega' : i < 24 ? 'large' : 'mid';
      const favs = [rng.pick(DEMO_CATEGORIES), rng.pick(DEMO_CATEGORIES)];
      this.traders.push({
        address: `0x${rng.hex(20)}`,
        userName: `${rng.pick(adjectives)}${rng.pick(nouns)}${rng.int(1, 99)}`,
        medianSize:
          tier === 'mega'
            ? rng.range(40_000, 150_000)
            : tier === 'large'
              ? rng.range(8_000, 40_000)
              : rng.range(1_000, 8_000),
        skill: rng.range(0.35, 0.68),
        liveRate: rng.range(0.1, 0.35),
        favoriteCategories: [...new Set(favs)],
      });
    }
  }

  private pickMarketFor(trader: DemoTrader, markets: readonly DemoMarket[], rng: Rng): DemoMarket {
    const preferred = markets.filter(
      (m) => m.category !== null && trader.favoriteCategories.includes(m.category),
    );
    return rng.pick(preferred.length > 0 && rng.chance(0.7) ? preferred : markets);
  }

  private makeFill(
    trader: DemoTrader,
    market: DemoMarket,
    index: number,
    side: 'BUY' | 'SELL',
    size: number,
    price: number,
    timestamp: number,
  ): TradeFill {
    const tokenId = market.tokenIds[index]!;
    const roundedSize = Math.round(size * 100) / 100;
    const txHash = `0x${new Rng(`${trader.address}|${tokenId}|${timestamp}|${side}`).hex(32)}`;
    return {
      id: fillId({
        transactionHash: txHash,
        traderAddress: trader.address,
        tokenId,
        side,
        size: roundedSize,
        price,
        timestamp,
      }),
      traderAddress: trader.address,
      conditionId: market.conditionId,
      tokenId,
      side,
      size: roundedSize,
      price,
      notional: roundedSize * price,
      timestamp,
      marketTitle: market.question,
      marketSlug: market.slug,
      eventSlug: market.eventSlug,
      outcome: market.outcomes[index] ?? null,
      outcomeIndex: index,
      transactionHash: txHash,
      category: market.category,
    };
  }

  private generateHistory() {
    const windowStart = this.startedAt - DEMO_EPOCH_DAYS * DAY_MS;
    for (const trader of this.traders) {
      const rng = new Rng(`${this.seed}|history|${trader.address}`);
      const fills: TradeFill[] = [];
      const positionCount = rng.int(12, 90);
      // Some traders go quiet: their activity ends early (to exercise "inactive" filters).
      const activeUntil = rng.chance(0.2)
        ? this.startedAt - rng.range(10, 40) * DAY_MS
        : this.startedAt - 60_000;
      for (let p = 0; p < positionCount; p++) {
        const openAt = windowStart + rng.float() * (activeUntil - windowStart);
        const candidates = this.markets.filter(
          (m) => m.resolvesAt === null || m.resolvesAt > openAt + DAY_MS,
        );
        if (candidates.length === 0) continue;
        const market = this.pickMarketFor(trader, candidates, rng);
        // Skilled traders more often pick the side that eventually wins.
        let index = rng.chance(0.5) ? 0 : 1;
        if (market.winningIndex !== null && rng.chance(trader.skill)) index = market.winningIndex;
        const total = Math.max(200, rng.logNormal(trader.medianSize, 0.8));
        const legs = rng.int(1, 3);
        let t = openAt;
        let shares = 0;
        for (let l = 0; l < legs; l++) {
          // No entries into a resolved (or effectively decided) market.
          if (market.resolvesAt !== null && t >= market.resolvesAt) break;
          const price = this.priceAt(market, index, t);
          if (price <= 0.01 || price >= 0.99) break;
          const size = total / legs / price;
          fills.push(this.makeFill(trader, market, index, 'BUY', size, price, Math.floor(t)));
          shares += Math.round(size * 100) / 100;
          t += rng.range(0.05, 1.5) * DAY_MS;
        }
        if (shares === 0) continue;
        // Exit before resolution in ~60% of cases.
        if (rng.chance(0.6)) {
          const exitAt = t + rng.range(0.2, 12) * DAY_MS;
          const limit = Math.min(
            this.startedAt - 60_000,
            market.resolvesAt ?? Number.POSITIVE_INFINITY,
          );
          if (exitAt < limit) {
            const price = this.priceAt(market, index, exitAt);
            fills.push(
              this.makeFill(trader, market, index, 'SELL', shares, price, Math.floor(exitAt)),
            );
          }
        }
      }
      fills.sort((a, b) => b.timestamp - a.timestamp);
      this.history.set(trader.address, fills);
    }
  }
}
