import {
  COPY_PROPOSAL_TTL_MS,
  calculateCopyAmount,
  canExecute,
  copyIdempotencyKey,
  dayStartUtc,
  estimateShares,
  evaluateCopyLimits,
  failedChecks,
  floorTo,
  formatUsd,
  proposalChecks,
  roundTo,
  shortAddress,
} from '@polymirror/shared';
import type { CopyPreview, CopySettings, LimitCheck, LimitCode } from '@polymirror/shared';
import type { ExecutionAdapter } from '../../adapters/execution/types';
import { AppError, badRequest, conflict, limitViolation, notFound } from '../../lib/errors';
import { publicOrder } from './types';
import type { CopyEventsPort, CopyOrderRecord, CopyStore, MarketPort, StoredTrade } from './types';

export interface CopyEngineConfig {
  maxTradeAgeMs: number;
  proposalTtlMs?: number;
  assistedVerifyTimeoutMs: number;
}

/** Filters: a trade outside the user's preferences is skipped silently (never proposed). */
const FILTER_CODES: readonly LimitCode[] = [
  'SIDE_NOT_SUPPORTED',
  'MIN_WHALE_TRADE_SIZE',
  'CATEGORY_NOT_ALLOWED',
  'MARKET_EXCLUDED',
  'INVALID_PRICE',
];

const IN_FLIGHT = ['EXECUTING', 'SUBMITTED'] as const;

/**
 * The copy engine turns detected whale trades into copy proposals and executes them only
 * after every safety limit passed *at execution time* and the user confirmed (or explicitly
 * enabled automatic mode on an execution venue that supports it).
 */
export class CopyEngine {
  constructor(
    private readonly store: CopyStore,
    private readonly execution: ExecutionAdapter,
    private readonly market: MarketPort,
    private readonly events: CopyEventsPort,
    private readonly config: CopyEngineConfig,
    private readonly now: () => number = Date.now,
  ) {}

  // -------------------------------------------------------------------------
  // Proposals
  // -------------------------------------------------------------------------

  /** Called by the watcher for every newly detected trade of a followed trader. */
  async onWhaleTrade(trade: StoredTrade, userIds: readonly string[]): Promise<void> {
    for (const userId of userIds) {
      try {
        await this.propose(userId, trade);
      } catch (err) {
        await this.store.audit(userId, 'copy.propose_error', trade.dbId, { message: (err as Error).message });
      }
    }
  }

  async propose(userId: string, trade: StoredTrade): Promise<CopyOrderRecord> {
    const settings = await this.store.getSettings(userId);
    const now = this.now();
    const { amount } = calculateCopyAmount(settings, trade.notional);
    const marketState = await this.market.getMarketState(trade.conditionId);

    const { order, created } = await this.store.insertOrderIfAbsent({
      userId,
      traderId: trade.traderId,
      traderAddress: trade.traderAddress,
      sourceTradeId: trade.dbId,
      idempotencyKey: copyIdempotencyKey(userId, trade.dbId),
      conditionId: trade.conditionId,
      tokenId: trade.tokenId,
      marketTitle: trade.marketTitle,
      marketUrl: marketState.url,
      outcome: trade.outcome,
      category: trade.category ?? marketState.category,
      side: trade.side,
      whaleSize: trade.notional,
      whalePrice: trade.price,
      amount,
      estimatedShares: estimateShares(amount, trade.price),
      status: 'PENDING',
      execution: this.execution.kind,
      failureReason: null,
      expiresAt: Math.min(trade.timestamp + this.config.maxTradeAgeMs, now + (this.config.proposalTtlMs ?? COPY_PROPOSAL_TTL_MS)),
    });
    // Duplicate detection: the same whale trade never produces a second proposal.
    if (!created) return order;

    const preview = await this.buildPreview(order, settings, { userConfirmed: false });
    const failed = failedChecks(preview.checks);
    const filter = failed.find((c) => FILTER_CODES.includes(c.code));
    if (filter) {
      return (await this.store.transition(order.id, ['PENDING'], { status: 'SKIPPED', failureReason: `Filtered: ${filter.message}` })) ?? order;
    }
    if (failed.length > 0) {
      const cancelled =
        (await this.store.transition(order.id, ['PENDING'], {
          status: 'CANCELLED',
          failureReason: `Blocked by limit: ${failed.map((c) => c.message).join('; ')}`,
        })) ?? order;
      await this.notifyLimit(userId, cancelled, failed);
      return cancelled;
    }

    this.events.emit(userId, 'copy.pending', { order: publicOrder(order), preview });
    await this.events.notify(userId, {
      type: 'WHALE_TRADE',
      title: '🐋 New whale trade',
      message: `${shortAddress(order.traderAddress)} bought ${formatUsd(order.whaleSize)} of "${order.marketTitle ?? 'Unknown market'}" — your copy: ${formatUsd(order.amount)}`,
      traderAddress: order.traderAddress,
      copyOrderId: order.id,
    });

    if (this.automaticAllowed(settings)) {
      await this.execute(userId, order.id, { automatic: true });
    }
    return order;
  }

  /** Automatic execution needs explicit opt-in AND a venue that can execute without a human. */
  private automaticAllowed(settings: CopySettings): boolean {
    return settings.mode === 'AUTOMATIC' && !settings.confirmationRequired && this.execution.supportsProgrammaticExecution;
  }

  async preview(userId: string, input: { copyOrderId?: string; sourceTradeId?: string }): Promise<CopyPreview> {
    let order: CopyOrderRecord | null = null;
    if (input.copyOrderId) order = await this.store.getOrder(input.copyOrderId);
    if (!order && input.sourceTradeId) {
      const trade = await this.store.getTrade(input.sourceTradeId);
      if (!trade) throw notFound('Trade not found');
      order = await this.propose(userId, trade);
    }
    if (!order || order.userId !== userId) throw notFound('Copy order not found');
    const settings = await this.store.getSettings(userId);
    return this.buildPreview(order, settings, { userConfirmed: false });
  }

  private async buildPreview(
    order: CopyOrderRecord,
    settings: CopySettings,
    opts: { userConfirmed: boolean },
  ): Promise<CopyPreview> {
    const { checks, currentPrice, exposure } = await this.evaluate(order, settings, opts);
    const visible = opts.userConfirmed ? checks : proposalChecks(checks);
    const maxDaily = settings.maxDailyAmount;
    return {
      copyOrderId: order.id,
      sourceTradeId: order.sourceTradeId,
      traderAddress: order.traderAddress,
      marketTitle: order.marketTitle,
      marketUrl: order.marketUrl,
      outcome: order.outcome,
      side: order.side,
      whaleSize: order.whaleSize,
      whalePrice: order.whalePrice,
      currentPrice,
      amount: order.amount,
      estimatedShares: estimateShares(order.amount, currentPrice ?? order.whalePrice),
      checks: visible,
      allowed: order.status === 'PENDING' && order.expiresAt > this.now() && canExecute(visible),
      execution: order.execution,
      dailyUsed: exposure.dailyUsed,
      dailyRemaining: Math.max(0, floorTo(maxDaily - exposure.dailyUsed)),
      openPositions: exposure.openPositions,
      expiresAt: order.expiresAt,
    };
  }

  private async evaluate(order: CopyOrderRecord, settings: CopySettings, opts: { userConfirmed: boolean }) {
    const now = this.now();
    const exposure = await this.store.exposure(order.userId, dayStartUtc(now), order.id);
    const [currentPrice, marketState, balance] = await Promise.all([
      this.market.getCurrentPrice(order.tokenId).catch(() => null),
      this.market.getMarketState(order.conditionId).catch(() => ({ active: null, url: null, category: null })),
      this.execution
        .getBalance({
          userId: order.userId,
          walletAddress: settings.walletAddress,
          openExposure: exposure.openExposure,
          realizedPnl: exposure.realizedPnl,
        })
        .catch(() => null),
    ]);
    const trade = await this.store.getTrade(order.sourceTradeId);
    const checks: LimitCheck[] = evaluateCopyLimits({
      settings,
      amount: order.amount,
      side: order.side,
      whaleNotional: order.whaleSize,
      whalePrice: order.whalePrice,
      currentPrice,
      dailyUsed: exposure.dailyUsed,
      openPositions: exposure.openPositions,
      balance,
      category: order.category,
      conditionId: order.conditionId,
      marketSlug: trade?.eventSlug ?? trade?.marketSlug ?? null,
      tradeTimestamp: trade?.timestamp ?? order.createdAt,
      now,
      maxTradeAgeMs: this.config.maxTradeAgeMs,
      marketActive: marketState.active,
      userConfirmed: opts.userConfirmed,
    });
    return { checks, currentPrice, exposure };
  }

  // -------------------------------------------------------------------------
  // Decisions
  // -------------------------------------------------------------------------

  async confirm(
    userId: string,
    input: { copyOrderId: string; expectedAmount: number; idempotencyKey: string },
  ): Promise<CopyOrderRecord> {
    // Replay of the same confirmation request returns the original result.
    const replay = await this.store.getOrderByConfirmKey(input.idempotencyKey);
    if (replay) {
      if (replay.userId !== userId || replay.id !== input.copyOrderId) throw conflict('Idempotency key already used');
      return replay;
    }
    return this.execute(userId, input.copyOrderId, {
      automatic: false,
      expectedAmount: input.expectedAmount,
      idempotencyKey: input.idempotencyKey,
    });
  }

  async skip(userId: string, copyOrderId: string, reason?: string): Promise<CopyOrderRecord> {
    const order = await this.store.getOrder(copyOrderId);
    if (!order || order.userId !== userId) throw notFound('Copy order not found');
    const skipped = await this.store.transition(order.id, ['PENDING'], {
      status: 'SKIPPED',
      failureReason: reason ? `Skipped: ${reason}` : 'Skipped by user',
    });
    if (!skipped) throw conflict(`Order is ${order.status.toLowerCase()} and can no longer be skipped`);
    await this.store.audit(userId, 'copy.skip', order.id, { reason });
    return skipped;
  }

  private async execute(
    userId: string,
    copyOrderId: string,
    opts: { automatic: boolean; expectedAmount?: number; idempotencyKey?: string },
  ): Promise<CopyOrderRecord> {
    const executing = await this.store.withUserLock(userId, async () => {
      const order = await this.store.getOrder(copyOrderId);
      if (!order || order.userId !== userId) throw notFound('Copy order not found');
      if (order.status !== 'PENDING') {
        throw conflict(`Order is already ${order.status.toLowerCase()}`, { status: order.status });
      }
      if (order.expiresAt <= this.now()) {
        await this.store.transition(order.id, ['PENDING'], { status: 'CANCELLED', failureReason: 'Proposal expired' });
        throw conflict('This trade is no longer fresh enough to copy — the proposal expired');
      }
      if (opts.expectedAmount !== undefined && Math.abs(opts.expectedAmount - order.amount) > 1e-6) {
        throw conflict('The order amount changed since you reviewed it. Please review again.', { amount: order.amount });
      }
      const settings = await this.store.getSettings(userId);
      if (order.execution === 'assisted' && !settings.walletAddress) {
        throw badRequest('Set your public Polymarket wallet address in Copy Settings so the fill can be verified.');
      }
      // All limits are re-checked right before the order is sent.
      const { checks } = await this.evaluate(order, settings, { userConfirmed: !opts.automatic });
      const ok = canExecute(checks, opts.automatic);
      if (!ok) {
        const failed = checks.filter((c) => (opts.automatic ? c.state !== 'pass' : c.state === 'fail'));
        if (opts.automatic) {
          // Unattended: leave the proposal for the user to review.
          await this.store.audit(userId, 'copy.auto_blocked', order.id, { checks: failed });
          return null;
        }
        await this.notifyLimit(userId, order, failed);
        throw limitViolation(failed.map((c) => c.message).join('; '), failed);
      }
      const next = await this.store.transition(order.id, ['PENDING'], {
        status: 'EXECUTING',
        executedAt: this.now(),
        confirmIdempotencyKey: opts.idempotencyKey ?? null,
      });
      if (!next) throw conflict('Order was modified concurrently');
      await this.store.audit(userId, opts.automatic ? 'copy.auto_execute' : 'copy.confirm', order.id, {
        amount: order.amount,
        checks: checks.map((c) => ({ code: c.code, state: c.state })),
      });
      return next;
    });
    if (!executing) {
      return (await this.store.getOrder(copyOrderId))!;
    }

    this.events.emit(userId, 'copy.executing', { order: publicOrder(executing) });
    const settings = await this.store.getSettings(userId);
    let result;
    try {
      result = await this.execution.submit(executing, { walletAddress: settings.walletAddress });
    } catch (err) {
      result = { status: 'rejected' as const, reason: err instanceof AppError ? err.message : 'Execution venue error' };
    }

    if (result.status === 'rejected') {
      return this.fail(userId, executing, result.reason ?? 'Order rejected');
    }
    const submitted = await this.store.transition(executing.id, ['EXECUTING'], {
      status: 'SUBMITTED',
      externalOrderId: result.externalOrderId ?? null,
    });
    if (!submitted) return (await this.store.getOrder(executing.id))!;
    if (result.status === 'awaiting_user') return submitted;
    return this.verify(userId, submitted.id);
  }

  /** Checks whether a SUBMITTED order has actually been filled. */
  async verify(userId: string, copyOrderId: string): Promise<CopyOrderRecord> {
    const order = await this.store.getOrder(copyOrderId);
    if (!order || order.userId !== userId) throw notFound('Copy order not found');
    if (order.status !== 'SUBMITTED') return order;
    const settings = await this.store.getSettings(userId);
    let result;
    try {
      result = await this.execution.verify(order, { walletAddress: settings.walletAddress, now: this.now() });
    } catch {
      return order; // Transient: try again on the next maintenance run.
    }
    if (result.status === 'pending') return order;
    if (result.status === 'failed') return this.fail(userId, order, result.reason ?? 'Fill could not be verified');

    const fillPrice = result.fillPrice ?? order.whalePrice;
    const shares = result.filledShares ?? estimateShares(order.amount, fillPrice);
    const confirmed = await this.store.transition(order.id, ['SUBMITTED'], {
      status: 'CONFIRMED',
      fillPrice,
      filledShares: shares,
      amount: result.filledAmount !== undefined ? floorTo(result.filledAmount, 6) : order.amount,
      transactionHash: result.transactionHash ?? null,
      externalOrderId: result.externalOrderId ?? order.externalOrderId,
      currentPrice: fillPrice,
      pnl: 0,
      failureReason: null,
    });
    if (!confirmed) return (await this.store.getOrder(order.id))!;
    this.events.emit(userId, 'copy.success', { order: publicOrder(confirmed) });
    await this.events.notify(userId, {
      type: 'COPY_SUCCESS',
      title: '📈 Position copied',
      message: `Copied ${formatUsd(confirmed.amount)} on "${confirmed.marketTitle ?? 'market'}" at ${fillPrice.toFixed(3)}`,
      traderAddress: confirmed.traderAddress,
      copyOrderId: confirmed.id,
    });
    await this.store.audit(userId, 'copy.confirmed', order.id, { fillPrice, shares, tx: result.transactionHash ?? null });
    return confirmed;
  }

  private async fail(userId: string, order: CopyOrderRecord, reason: string): Promise<CopyOrderRecord> {
    const failed =
      (await this.store.transition(order.id, [...IN_FLIGHT], { status: 'FAILED', failureReason: reason })) ??
      (await this.store.getOrder(order.id))!;
    this.events.emit(userId, 'copy.failed', { order: publicOrder(failed), reason });
    await this.events.notify(userId, {
      type: 'COPY_FAILED',
      title: '⚠️ Copy failed',
      message: `${reason} — "${order.marketTitle ?? 'market'}"`,
      traderAddress: order.traderAddress,
      copyOrderId: order.id,
    });
    await this.store.audit(userId, 'copy.failed', order.id, { reason });
    return failed;
  }

  private async notifyLimit(userId: string, order: CopyOrderRecord, failed: LimitCheck[]) {
    const codes = new Set(failed.map((c) => c.code));
    const base = { traderAddress: order.traderAddress, copyOrderId: order.id };
    if (codes.has('MAX_DAILY_COPY_VOLUME')) {
      await this.events.notify(userId, { ...base, type: 'DAILY_LIMIT_REACHED', title: 'Daily limit reached', message: failed.find((c) => c.code === 'MAX_DAILY_COPY_VOLUME')!.message });
    }
    if (codes.has('MIN_BALANCE')) {
      await this.events.notify(userId, { ...base, type: 'INSUFFICIENT_BALANCE', title: 'Insufficient balance', message: failed.find((c) => c.code === 'MIN_BALANCE')!.message });
    }
    if (codes.has('MARKET_UNAVAILABLE')) {
      await this.events.notify(userId, { ...base, type: 'MARKET_UNAVAILABLE', title: 'Market unavailable', message: `"${order.marketTitle ?? 'Market'}" is closed or unavailable` });
    }
  }

  // -------------------------------------------------------------------------
  // Maintenance
  // -------------------------------------------------------------------------

  /** Expires stale proposals, verifies submitted orders, and marks open copies to market. */
  async runMaintenance(): Promise<{ expired: number; verified: number; failed: number; marked: number }> {
    const now = this.now();
    let expired = 0;
    let verified = 0;
    let failed = 0;
    let marked = 0;

    for (const order of await this.store.listByStatus(['PENDING'], 500)) {
      if (order.expiresAt > now) continue;
      const done = await this.store.transition(order.id, ['PENDING'], { status: 'CANCELLED', failureReason: 'Proposal expired' });
      if (done) expired++;
    }

    for (const order of await this.store.listByStatus(['SUBMITTED'], 200)) {
      const after = await this.verify(order.userId, order.id);
      if (after.status === 'CONFIRMED') verified++;
      else if (after.status === 'SUBMITTED' && now - (order.executedAt ?? order.createdAt) > this.config.assistedVerifyTimeoutMs) {
        await this.fail(
          order.userId,
          order,
          `No matching fill found on your wallet within ${Math.round(this.config.assistedVerifyTimeoutMs / 60_000)} minutes`,
        );
        failed++;
      }
    }

    // A crash between EXECUTING and SUBMITTED leaves an order in limbo: fail it safely.
    for (const order of await this.store.listByStatus(['EXECUTING'], 200)) {
      if (now - (order.executedAt ?? order.createdAt) > 5 * 60_000) {
        await this.fail(order.userId, order, 'Execution did not complete');
        failed++;
      }
    }

    for (const order of await this.store.listOpenConfirmed(500)) {
      if (order.filledShares === null) continue;
      const state = await this.market.getMarketState(order.conditionId).catch(() => null);
      const resolved = state?.resolvedPrice?.(order.tokenId) ?? null;
      const price = resolved ?? (await this.market.getCurrentPrice(order.tokenId).catch(() => null));
      if (price === null) continue;
      await this.store.update(order.id, {
        currentPrice: price,
        pnl: roundTo(order.filledShares * price - order.amount, 6),
        closedAt: resolved !== null ? now : null,
      });
      marked++;
    }
    return { expired, verified, failed, marked };
  }
}
