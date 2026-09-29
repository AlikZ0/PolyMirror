/**
 * Deterministic identifiers used for de-duplication and idempotency.
 */

/** A fill identifier derived only from source data, so re-polling the API never creates duplicates. */
export function fillId(input: {
  transactionHash: string | null;
  traderAddress: string;
  tokenId: string;
  side: string;
  size: number;
  price: number;
  timestamp: number;
}): string {
  const base = input.transactionHash ?? `ts${input.timestamp}`;
  return [
    base.toLowerCase(),
    input.traderAddress.toLowerCase(),
    input.tokenId,
    input.side,
    input.size.toString(),
    input.price.toString(),
  ].join(':');
}

/** One copy proposal per (user, source trade). Enforced by a unique DB constraint as well. */
export function copyIdempotencyKey(userId: string, sourceTradeId: string): string {
  return `${userId}::${sourceTradeId}`;
}
