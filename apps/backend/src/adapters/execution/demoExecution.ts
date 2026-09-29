import type { CopyOrder } from '@polymirror/shared';
import { floorTo } from '@polymirror/shared';
import { unitHash } from '../polymarket/demo/prng';
import type { BalanceContext, ExecutionAdapter, SubmitResult, VerifyResult } from './types';

export const DEMO_START_BALANCE = 1_000;

/**
 * DEMO MODE execution: a local simulation. It never contacts Polymarket or any wallet.
 * Fills are recorded in memory and must still be verified before an order counts as copied.
 */
export class DemoExecutionAdapter implements ExecutionAdapter {
  readonly kind = 'demo' as const;
  readonly supportsProgrammaticExecution = true;
  private readonly ledger = new Map<string, { price: number; shares: number; at: number }>();

  constructor(
    private readonly priceOf: (tokenId: string) => Promise<number | null>,
    private readonly options: { rejectRate?: number; now?: () => number } = {},
  ) {}

  async getBalance(ctx: BalanceContext): Promise<number | null> {
    return floorTo(DEMO_START_BALANCE + ctx.realizedPnl - ctx.openExposure);
  }

  async submit(order: CopyOrder): Promise<SubmitResult> {
    const price = await this.priceOf(order.tokenId);
    if (price === null) return { status: 'rejected', reason: 'Market unavailable (simulated)' };
    if (unitHash(`reject|${order.id}`) < (this.options.rejectRate ?? 0.04)) {
      return { status: 'rejected', reason: 'Insufficient liquidity at the requested price (simulated)' };
    }
    const shares = floorTo(order.amount / price, 4);
    this.ledger.set(order.id, { price, shares, at: (this.options.now ?? Date.now)() });
    return { status: 'accepted', externalOrderId: `demo-${order.id}` };
  }

  async verify(order: CopyOrder): Promise<VerifyResult> {
    const fill = this.ledger.get(order.id);
    if (!fill) return { status: 'failed', reason: 'Simulated order not found (demo state was reset)' };
    return {
      status: 'confirmed',
      fillPrice: fill.price,
      filledShares: fill.shares,
      filledAmount: order.amount,
      externalOrderId: `demo-${order.id}`,
      transactionHash: null,
    };
  }
}
