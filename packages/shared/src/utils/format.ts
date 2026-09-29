import type { CopyDisplayStatus, CopyOrderStatus } from '../types';

export const NA = 'N/A';

export function shortAddress(address: string | null | undefined, chars = 4): string {
  if (!address) return NA;
  if (address.length <= 2 + chars * 2) return address;
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

export function formatUsd(
  value: number | null | undefined,
  opts: { signed?: boolean; compact?: boolean; decimals?: number } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NA;
  const abs = Math.abs(value);
  const decimals = opts.decimals ?? (abs >= 1000 || opts.compact ? 0 : 2);
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: opts.compact && abs >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: opts.compact && abs >= 10_000 ? 1 : decimals,
    minimumFractionDigits: opts.compact && abs >= 10_000 ? 0 : decimals,
  }).format(abs);
  const sign = value < 0 ? '-' : opts.signed && value > 0 ? '+' : '';
  return `${sign}${formatted}`;
}

/** Formats a ratio (0.1234 -> "12.34%"). */
export function formatPct(
  value: number | null | undefined,
  opts: { signed?: boolean; decimals?: number } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NA;
  const pct = value * 100;
  const sign = pct < 0 ? '-' : opts.signed && pct > 0 ? '+' : '';
  return `${sign}${Math.abs(pct).toFixed(opts.decimals ?? 2)}%`;
}

export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NA;
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(value);
}

export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NA;
  return `$${value.toFixed(value < 0.1 ? 3 : 2)}`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return NA;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export function formatDateTime(ts: number | null | undefined): string {
  if (ts === null || ts === undefined) return NA;
  return new Date(ts).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(ts: number | null | undefined, now = Date.now()): string {
  if (ts === null || ts === undefined) return NA;
  const diff = Math.max(0, now - ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function toDisplayStatus(status: CopyOrderStatus): CopyDisplayStatus {
  switch (status) {
    case 'PENDING':
    case 'EXECUTING':
    case 'SUBMITTED':
      return 'Pending';
    case 'CONFIRMED':
      return 'Copied';
    case 'SKIPPED':
      return 'Skipped';
    case 'FAILED':
      return 'Failed';
    case 'CANCELLED':
      return 'Cancelled';
  }
}
