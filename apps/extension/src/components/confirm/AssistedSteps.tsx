import { Button, Callout } from '@polymirror/ui';
import type { CopyOrder, CopyPreview } from '@polymirror/shared';
import { safePolymarketUrl } from '../../utils/chromeApi';
import { setItem } from '../../utils/storage';
import { formatAmount, formatNumber, formatPrice } from '../../utils/format';

interface AssistedStepsProps {
  order: CopyOrder;
  preview: CopyPreview;
  verifying: boolean;
  verifyRequested: boolean;
  onVerify: () => void;
}

/**
 * Assisted execution: PolyMirror cannot place the order for the user. It prepares the details,
 * opens the market on Polymarket and later verifies a matching fill on the user's public wallet.
 */
export function AssistedSteps({ order, preview, verifying, verifyRequested, onVerify }: AssistedStepsProps) {
  const url = safePolymarketUrl(order.marketUrl ?? preview.marketUrl);

  const openMarket = async () => {
    if (!url) return;
    // Hand the prepared details to the (display-only) polymarket.com overlay.
    await setItem('assistedOrder', {
      copyOrderId: order.id,
      marketTitle: order.marketTitle ?? preview.marketTitle,
      marketUrl: url,
      outcome: order.outcome ?? preview.outcome,
      side: order.side,
      amount: order.amount,
      estimatedShares: order.estimatedShares,
      price: preview.currentPrice ?? order.whalePrice,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 60_000,
    });
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex flex-col gap-3" data-testid="assisted-steps">
      <Callout variant="info" title="Order submitted — place it yourself on Polymarket">
        PolyMirror does not place orders on your behalf in this mode. Place exactly this order on
        Polymarket, then click “I placed the order”. The status becomes <strong>Copied</strong> only
        after the backend verifies a matching fill on your wallet.
      </Callout>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-surface-2/60 px-3 py-2 text-xs">
        <dt className="text-muted">Side / outcome</dt>
        <dd className="text-right">
          {order.side} {order.outcome ?? ''}
        </dd>
        <dt className="text-muted">Amount</dt>
        <dd className="text-right font-bold text-positive">{formatAmount(order.amount)}</dd>
        <dt className="text-muted">Limit price</dt>
        <dd className="text-right">{formatPrice(preview.currentPrice ?? order.whalePrice)}</dd>
        <dt className="text-muted">Est. shares</dt>
        <dd className="text-right">{formatNumber(order.estimatedShares, 2)}</dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void openMarket()} disabled={!url}>
          Open on Polymarket ↗
        </Button>
        <Button variant="primary" onClick={onVerify} loading={verifying}>
          I placed the order
        </Button>
      </div>
      {!url ? <p className="text-xs text-warning">Market link unavailable — search the market on Polymarket.</p> : null}
      {verifyRequested && !verifying ? (
        <p className="text-xs text-muted" role="status">
          Verification requested. Waiting for a matching fill on your wallet — this can take a few
          minutes. You can close this window; the status updates in Activity.
        </p>
      ) : null}
    </div>
  );
}
