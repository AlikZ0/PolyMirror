/**
 * Parsers for Polymarket public API payloads.
 *
 * Shapes follow the official TypeScript bindings (`@polymarket/bindings`, data v2):
 * - list endpoints return `{ data: T[], pagination: { limit, offset, has_more, next_cursor } }`
 * - decimals arrive as strings or numbers, timestamps as epoch *seconds*
 * - trade:     proxy_wallet, side, token_id, condition_id, size, price, timestamp, title, slug,
 *              event_slug, outcome, outcome_index, name, pseudonym, profile_image, transaction_hash
 * - position:  proxy_wallet, token_id, condition_id, avg_price, total_cost_usdc, total_size,
 *              realized_pnl, total_pnl, current_price, status (OPEN|REDEEMABLE|CLOSED), last_event_at
 * - leaderboard: rank, user_id, pnl, volume, user_name, profile_image
 * - user-stats:  { data: { proxy_wallet, trades, biggest_win, views, join_date } }
 *
 * Parsing is deliberately tolerant: unknown fields are ignored, malformed rows are dropped
 * (never guessed), and missing values become null.
 */
import { fillId, toNumber } from '@polymirror/shared';
import type { LeaderboardEntry, MarketInfo, TradeFill, TraderPosition } from '@polymirror/shared';
import { z } from 'zod';

const decimal = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const n = toNumber(v);
  if (n === null) {
    ctx.addIssue({ code: 'custom', message: 'not a decimal' });
    return z.NEVER;
  }
  return n;
});
const optDecimal = z.union([z.string(), z.number()]).nullish().transform((v) => (v === null || v === undefined ? null : toNumber(v)));
const optString = z.string().nullish().transform((v) => (v === undefined || v === null || v === '' ? null : v));
const epochSeconds = z.union([z.number(), z.string().regex(/^\d+$/)]).transform((v) => Number(v) * 1000);

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Extracts the rows and cursor from a v2 envelope (tolerates a bare array). */
export function unwrapPage(json: unknown): Page<unknown> {
  if (Array.isArray(json)) return { items: json, nextCursor: null };
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    const data = Array.isArray(o.data) ? o.data : Array.isArray(o.items) ? o.items : [];
    const pagination = (o.pagination ?? {}) as Record<string, unknown>;
    const cursor = typeof pagination.next_cursor === 'string' && pagination.next_cursor ? pagination.next_cursor : null;
    return { items: data, nextCursor: pagination.has_more === false ? null : cursor };
  }
  return { items: [], nextCursor: null };
}

export function unwrapData(json: unknown): unknown {
  if (json && typeof json === 'object' && 'data' in (json as object)) return (json as { data: unknown }).data;
  return json;
}

const rawTrade = z.object({
  proxy_wallet: z.string(),
  side: z.enum(['BUY', 'SELL']),
  token_id: z.string(),
  condition_id: z.string(),
  size: decimal,
  price: decimal,
  timestamp: epochSeconds,
  title: optString,
  slug: optString,
  event_slug: optString,
  outcome: optString,
  outcome_index: z.number().int().nullish(),
  name: optString,
  pseudonym: optString,
  profile_image: optString,
  transaction_hash: optString,
});

export type RawTrade = z.infer<typeof rawTrade>;

export function parseTrades(rows: readonly unknown[]): { fills: TradeFill[]; profiles: Map<string, { userName: string | null; profileImage: string | null }> } {
  const fills: TradeFill[] = [];
  const profiles = new Map<string, { userName: string | null; profileImage: string | null }>();
  for (const row of rows) {
    const r = rawTrade.safeParse(row);
    if (!r.success) continue;
    const t = r.data;
    const trader = t.proxy_wallet.toLowerCase();
    profiles.set(trader, { userName: t.name ?? t.pseudonym, profileImage: t.profile_image });
    fills.push({
      id: fillId({
        transactionHash: t.transaction_hash,
        traderAddress: trader,
        tokenId: t.token_id,
        side: t.side,
        size: t.size,
        price: t.price,
        timestamp: t.timestamp,
      }),
      traderAddress: trader,
      conditionId: t.condition_id,
      tokenId: t.token_id,
      side: t.side,
      size: t.size,
      price: t.price,
      notional: t.size * t.price,
      timestamp: t.timestamp,
      marketTitle: t.title,
      marketSlug: t.slug,
      eventSlug: t.event_slug,
      outcome: t.outcome,
      outcomeIndex: t.outcome_index === 999 ? null : (t.outcome_index ?? null),
      transactionHash: t.transaction_hash,
      category: null,
    });
  }
  return { fills, profiles };
}

const rawPosition = z.object({
  proxy_wallet: z.string(),
  token_id: z.string(),
  condition_id: z.string(),
  avg_price: optDecimal,
  entry_cost_usdc: optDecimal,
  total_cost_usdc: optDecimal,
  total_size: optDecimal,
  current_price: optDecimal,
  realized_pnl: optDecimal,
  total_pnl: optDecimal,
  status: z.enum(['OPEN', 'REDEEMABLE', 'CLOSED']),
  title: optString,
  slug: optString,
  event_slug: optString,
  outcome: optString,
  last_event_at: epochSeconds.nullish(),
});

export function parsePositions(rows: readonly unknown[], firstBuyAt: ReadonlyMap<string, number>): TraderPosition[] {
  const out: TraderPosition[] = [];
  for (const row of rows) {
    const r = rawPosition.safeParse(row);
    if (!r.success) continue;
    const p = r.data;
    const cost = p.total_cost_usdc ?? p.entry_cost_usdc;
    if (cost === null || cost <= 0) continue;
    const pnl = p.total_pnl ?? p.realized_pnl;
    if (pnl === null) continue;
    const status: TraderPosition['status'] =
      p.status === 'OPEN' ? 'OPEN' : p.status === 'REDEEMABLE' ? 'RESOLVED' : 'CLOSED';
    const realized = p.realized_pnl ?? (status === 'OPEN' ? 0 : pnl);
    const exitPrice =
      status === 'OPEN'
        ? null
        : p.total_size && p.total_size > 0
          ? (cost + realized) / p.total_size
          : p.current_price;
    const address = p.proxy_wallet.toLowerCase();
    out.push({
      id: `${address}|${p.token_id}`,
      traderAddress: address,
      conditionId: p.condition_id,
      tokenId: p.token_id,
      marketTitle: p.title,
      marketSlug: p.event_slug ?? p.slug,
      outcome: p.outcome,
      category: null,
      status,
      entryPrice: p.avg_price,
      exitPrice,
      cost,
      pnl,
      realizedPnl: realized,
      roi: pnl / cost,
      openedAt: firstBuyAt.get(p.token_id) ?? null,
      closedAt: status === 'OPEN' ? null : (p.last_event_at ?? null),
    });
  }
  return out;
}

const rawLeader = z.object({
  rank: z.number().int().nullish(),
  user_id: z.string(),
  pnl: optDecimal,
  volume: optDecimal,
  user_name: optString,
  profile_image: optString,
});

export function parseLeaderboard(rows: readonly unknown[]): LeaderboardEntry[] {
  const out: LeaderboardEntry[] = [];
  for (const row of rows) {
    const r = rawLeader.safeParse(row);
    if (!r.success) continue;
    out.push({
      address: r.data.user_id.toLowerCase(),
      rank: r.data.rank ?? null,
      userName: r.data.user_name,
      profileImage: r.data.profile_image,
      pnl: r.data.pnl,
      volume: r.data.volume,
    });
  }
  return out;
}

const rawUserStats = z.object({
  trades: z.number().int().nullish(),
  biggest_win: optDecimal,
  join_date: z.union([z.number(), z.string()]).nullish(),
});

export function parseUserStats(json: unknown) {
  const r = rawUserStats.safeParse(unwrapData(json));
  if (!r.success) return null;
  const jd = r.data.join_date;
  let joinDate: number | null = null;
  if (typeof jd === 'number') joinDate = jd * 1000;
  else if (typeof jd === 'string') {
    const t = /^\d+$/.test(jd) ? Number(jd) * 1000 : Date.parse(jd);
    joinDate = Number.isFinite(t) ? t : null;
  }
  return { marketsTraded: r.data.trades ?? null, biggestWin: r.data.biggest_win, joinDate };
}

/** Gamma encodes some arrays as JSON strings. */
function jsonArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const parsed: unknown = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Top-level categories we recognise from Gamma tags / category fields.
 * A market that carries none of them gets `category: null` (shown as "Uncategorized"), never a guess.
 */
const KNOWN_CATEGORIES = [
  'Politics',
  'Crypto',
  'Sports',
  'Economy',
  'Finance',
  'Business',
  'Tech',
  'Science',
  'Culture',
  'Pop Culture',
  'World',
  'Geopolitics',
  'Elections',
  'Weather',
] as const;

export function pickCategory(raw: Record<string, unknown>): string | null {
  const candidates: string[] = [];
  if (typeof raw.category === 'string') candidates.push(raw.category);
  for (const t of jsonArray(raw.tags)) {
    if (t && typeof t === 'object' && typeof (t as { label?: unknown }).label === 'string') {
      candidates.push((t as { label: string }).label);
    }
  }
  for (const c of candidates) {
    const hit = KNOWN_CATEGORIES.find((k) => k.toLowerCase() === c.trim().toLowerCase());
    if (hit) return hit;
  }
  return null;
}

export function parseMarkets(json: unknown, webUrl: string): MarketInfo[] {
  const rows = Array.isArray(json)
    ? json
    : json && typeof json === 'object'
      ? ((json as Record<string, unknown>).markets ?? (json as Record<string, unknown>).data ?? [])
      : [];
  if (!Array.isArray(rows)) return [];
  const out: MarketInfo[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const m = row as Record<string, unknown>;
    const conditionId = typeof m.conditionId === 'string' ? m.conditionId : typeof m.condition_id === 'string' ? m.condition_id : null;
    const question = typeof m.question === 'string' ? m.question : null;
    if (!conditionId || !question) continue;
    const events = jsonArray(m.events);
    const eventSlug =
      events[0] && typeof (events[0] as { slug?: unknown }).slug === 'string' ? (events[0] as { slug: string }).slug : null;
    const slug = typeof m.slug === 'string' ? m.slug : null;
    out.push({
      conditionId,
      question,
      slug,
      eventSlug,
      category: pickCategory(m),
      active: m.active !== false,
      closed: m.closed === true,
      outcomes: jsonArray(m.outcomes).map(String),
      tokenIds: jsonArray(m.clobTokenIds).map(String),
      outcomePrices: jsonArray(m.outcomePrices).map((p) => toNumber(p) ?? Number.NaN),
      url: eventSlug ? `${webUrl}/event/${eventSlug}` : slug ? `${webUrl}/market/${slug}` : null,
    });
  }
  return out;
}

export function parseMidpoint(json: unknown): number | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  const v = toNumber(o.mid ?? o.midpoint ?? o.price);
  return v !== null && v > 0 && v < 1 ? v : null;
}
