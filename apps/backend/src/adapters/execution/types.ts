import type { CopyOrder, ExecutionKind } from '@polymirror/shared';

export interface BalanceContext {
  userId: string;
  walletAddress: string | null;
  /** USDC currently committed to open / in-flight copies. */
  openExposure: number;
  /** Realized P/L of closed copies. */
  realizedPnl: number;
}

export interface SubmitResult {
  /**
   * accepted        — the venue accepted the order; it still has to be verified.
   * awaiting_user   — assisted mode: the user must place the order on Polymarket themselves.
   * rejected        — the order was rejected; nothing was executed.
   */
  status: 'accepted' | 'awaiting_user' | 'rejected';
  externalOrderId?: string | null;
  reason?: string;
}

export interface VerifyResult {
  status: 'confirmed' | 'pending' | 'failed';
  fillPrice?: number;
  filledShares?: number;
  filledAmount?: number;
  transactionHash?: string | null;
  externalOrderId?: string | null;
  reason?: string;
}

/**
 * Write-side boundary. An order is only CONFIRMED after `verify` finds evidence of the fill —
 * a successful submit request alone is never treated as success.
 */
export interface ExecutionAdapter {
  readonly kind: ExecutionKind;
  /** True only if orders can be placed without a human (demo simulation). */
  readonly supportsProgrammaticExecution: boolean;
  /** Available balance (USDC) or null when it cannot be read. */
  getBalance(ctx: BalanceContext): Promise<number | null>;
  submit(order: CopyOrder, ctx: { walletAddress: string | null }): Promise<SubmitResult>;
  verify(
    order: CopyOrder,
    ctx: { walletAddress: string | null; now: number },
  ): Promise<VerifyResult>;
}
