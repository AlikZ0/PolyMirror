import type { ReactNode } from 'react';
import type { CopyOrder, CopyPreview } from '@polymirror/shared';
import { Badge } from '@polymirror/ui';
import { formatAmount, formatNumber, formatPrice, formatUsd, shortAddress } from '../../utils/format';

function Row({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={strong ? 'text-base font-bold text-positive tabular-nums' : 'text-sm tabular-nums text-right'}>
        {children}
      </dd>
    </div>
  );
}

/** The facts of the proposed copy. "Your copy" always comes from the preview (the user's settings). */
export function OrderDetails({ order, preview }: { order: CopyOrder; preview: CopyPreview }) {
  return (
    <dl className="divide-y divide-border/50">
      <Row label="Trader">
        <span title={order.traderAddress} className="font-mono">
          {shortAddress(order.traderAddress)}
        </span>
      </Row>
      <Row label="Market">
        <span className="line-clamp-2">{preview.marketTitle ?? order.marketTitle ?? 'N/A'}</span>
      </Row>
      <Row label="Trader position">{formatUsd(preview.whaleSize)}</Row>
      <Row label="Side">
        <Badge variant={preview.side === 'BUY' ? 'positive' : 'negative'}>{preview.side}</Badge>{' '}
        <span className="text-xs text-muted">{preview.outcome ?? order.outcome ?? ''}</span>
      </Row>
      <Row label="Price">{formatPrice(preview.whalePrice)}</Row>
      <Row label="Current price">{formatPrice(preview.currentPrice)}</Row>
      <Row label="Your copy" strong>
        {formatAmount(preview.amount)}
      </Row>
      <Row label="Estimated shares">{formatNumber(preview.estimatedShares, 2)}</Row>
      <Row label="Daily used / remaining">
        {formatUsd(preview.dailyUsed)} / {formatUsd(preview.dailyRemaining)}
      </Row>
    </dl>
  );
}
