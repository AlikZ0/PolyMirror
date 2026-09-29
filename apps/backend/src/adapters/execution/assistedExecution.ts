import type { CopyOrder } from '@polymirror/shared';
import { sum } from '@polymirror/shared';
import type { PolymarketAdapter } from '../polymarket/types';
import type { ExecutionAdapter, SubmitResult, VerifyResult } from './types';

/** Tolerance for clock skew between the confirmation and the on-chain fill. */
const MATCH_WINDOW_BEFORE_MS = 2 * 60_000;

/**
 * LIVE MODE execution ("assisted").
 *
 * Polymarket CLOB orders must be signed with the user's wallet key (EIP-712, L1 auth). PolyMirror
 * never holds keys, so it cannot place orders by itself. Instead it prepares the order, the user
 * places it on polymarket.com, and PolyMirror verifies the resulting fill through the public
 * Data API (`/v2/trades?user=<wallet>`). Only a verified fill marks the copy as CONFIRMED.
 */
export class AssistedExecutionAdapter implements ExecutionAdapter {
  readonly kind = 'assisted' as const;
  readonly supportsProgrammaticExecution = false;

  constructor(private readonly polymarket: PolymarketAdapter) {}

  async getBalance(): Promise<number | null> {
    // Cash balance is only available through authenticated CLOB endpoints — not used.
    return null;
  }

  async submit(): Promise<SubmitResult> {
    return { status: 'awaiting_user' };
  }

  async verify(order: CopyOrder, ctx: { walletAddress: string | null }): Promise<VerifyResult> {
    if (!ctx.walletAddress) {
      return { status: 'pending', reason: 'Set your public wallet address to verify the fill' };
    }
    const since = (order.executedAt ?? order.createdAt) - MATCH_WINDOW_BEFORE_MS;
    const fills = (
      await this.polymarket.getTraderFills(ctx.walletAddress, {
        since,
        conditionId: order.conditionId,
        side: 'BUY',
        maxFills: 100,
      })
    ).filter((f) => f.tokenId === order.tokenId && f.timestamp >= since);

    if (fills.length === 0) return { status: 'pending', reason: 'No matching fill found yet' };

    const shares = sum(fills.map((f) => f.size));
    const amount = sum(fills.map((f) => f.notional));
    const earliest = [...fills].sort((a, b) => a.timestamp - b.timestamp)[0]!;
    return {
      status: 'confirmed',
      fillPrice: shares > 0 ? amount / shares : earliest.price,
      filledShares: shares,
      filledAmount: amount,
      transactionHash: earliest.transactionHash,
      externalOrderId: null,
    };
  }
}
