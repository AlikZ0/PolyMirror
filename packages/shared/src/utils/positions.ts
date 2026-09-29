import type { TradeFill, TraderPosition } from '../types';

const EPS = 1e-9;

export interface ReconstructOptions {
  /** Final payout price per token (0 or 1, or a fractional settlement) for resolved markets. */
  resolutions?: ReadonlyMap<string, { price: number; resolvedAt: number | null }>;
  /** Current mark price per token, used for unrealized P/L of open positions. */
  markPrices?: ReadonlyMap<string, number>;
}

export interface ReconstructResult {
  positions: TraderPosition[];
  /** Tokens whose sells could not be matched with observed buys (history truncated). */
  unmatchedSellTokens: string[];
}

/**
 * Rebuilds per-token positions from raw fills using the average-cost method.
 *
 * - BUY adds shares at cost.
 * - SELL realizes (price - averageCost) * shares; sells beyond observed holdings are ignored
 *   because their cost basis is unknown (reported via `unmatchedSellTokens`).
 * - A remaining balance in a resolved market is settled at the resolution price.
 * - Open positions use the mark price for unrealized P/L when provided, otherwise 0.
 */
export function reconstructPositions(
  fills: readonly TradeFill[],
  options: ReconstructOptions = {},
): ReconstructResult {
  const byToken = new Map<string, TradeFill[]>();
  for (const f of fills) {
    // Malformed fills (non-positive price or size) carry no usable cost basis.
    if (!(f.price > 0) || !(f.size > 0) || !Number.isFinite(f.price) || !Number.isFinite(f.size))
      continue;
    const key = `${f.traderAddress.toLowerCase()}|${f.tokenId}`;
    const list = byToken.get(key);
    if (list) list.push(f);
    else byToken.set(key, [f]);
  }

  const positions: TraderPosition[] = [];
  const unmatched = new Set<string>();

  for (const [key, list] of byToken) {
    list.sort((a, b) => a.timestamp - b.timestamp);
    const first = list[0]!;
    let shares = 0;
    let costBasis = 0;
    let boughtCost = 0;
    let boughtShares = 0;
    let soldShares = 0;
    let proceeds = 0;
    let realized = 0;
    let openedAt: number | null = null;
    let lastSellAt: number | null = null;

    for (const f of list) {
      if (f.side === 'BUY') {
        if (openedAt === null) openedAt = f.timestamp;
        shares += f.size;
        costBasis += f.notional;
        boughtCost += f.notional;
        boughtShares += f.size;
      } else {
        const qty = Math.min(f.size, shares);
        if (f.size - qty > EPS) unmatched.add(f.tokenId);
        if (qty <= EPS) continue;
        const avg = costBasis / shares;
        realized += qty * (f.price - avg);
        costBasis -= qty * avg;
        shares -= qty;
        soldShares += qty;
        proceeds += qty * f.price;
        lastSellAt = f.timestamp;
      }
    }

    if (boughtShares <= EPS) continue; // Sell-only history: cost basis unknown, no position.

    let status: TraderPosition['status'] = 'OPEN';
    let closedAt: number | null = null;
    let unrealized = 0;
    let exitShares = soldShares;
    let exitValue = proceeds;
    const resolution = options.resolutions?.get(first.tokenId);

    if (shares <= EPS) {
      status = 'CLOSED';
      closedAt = lastSellAt;
    } else if (resolution) {
      const avg = costBasis / shares;
      realized += shares * (resolution.price - avg);
      exitShares += shares;
      exitValue += shares * resolution.price;
      status = 'RESOLVED';
      closedAt = resolution.resolvedAt ?? list[list.length - 1]!.timestamp;
    } else {
      const mark = options.markPrices?.get(first.tokenId);
      if (mark !== undefined) unrealized = shares * mark - costBasis;
    }

    const pnl = realized + unrealized;
    positions.push({
      id: key,
      traderAddress: first.traderAddress.toLowerCase(),
      conditionId: first.conditionId,
      tokenId: first.tokenId,
      marketTitle: first.marketTitle,
      marketSlug: first.eventSlug ?? first.marketSlug,
      outcome: first.outcome,
      category: first.category,
      status,
      entryPrice: boughtCost / boughtShares,
      exitPrice: exitShares > EPS ? exitValue / exitShares : null,
      cost: boughtCost,
      pnl,
      realizedPnl: realized,
      roi: boughtCost > EPS ? pnl / boughtCost : null,
      openedAt,
      closedAt,
    });
  }

  return { positions, unmatchedSellTokens: [...unmatched] };
}
