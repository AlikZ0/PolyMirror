import { formatUsd } from '@polymirror/shared';

export {
  NA,
  formatUsd,
  formatPct,
  formatNumber,
  formatPrice,
  formatDuration,
  formatDateTime,
  formatRelativeTime,
  shortAddress,
  toDisplayStatus,
} from '@polymirror/shared';

/** "$10" for whole amounts, "$10.50" otherwise — used for the user's order amount. */
export function formatAmount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return formatUsd(value, { decimals: Number.isInteger(value) ? 0 : 2 });
}

/** Tailwind text color for a signed value. */
export function signClass(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0)
    return 'text-fg';
  return value > 0 ? 'text-positive' : 'text-negative';
}

/** Compact notation only for large values, so small P/L (e.g. $2.40) is never rounded away. */
export function formatUsdShort(value: number | null | undefined, signed = false): string {
  const large = value !== null && value !== undefined && Math.abs(value) >= 10_000;
  return formatUsd(value, { signed, compact: large });
}
