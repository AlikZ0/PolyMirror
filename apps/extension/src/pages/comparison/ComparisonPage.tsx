import { Link, useParams } from 'react-router-dom';
import { Callout, Card, CardContent, CardHeader, CardTitle } from '@polymirror/ui';
import type { ComparisonSide } from '@polymirror/shared';
import { PageHeader } from '../../components/common/PageHeader';
import { QueryBoundary } from '../../components/common/QueryBoundary';
import { formatNumber, formatPct, formatUsd, shortAddress } from '../../utils/format';
import { useTraderPerformance } from '../../hooks/queries';

/**
 * Neutral side-by-side comparison. Deliberately no verdict and no winner highlighting:
 * both columns use the same styling and values are shown as-is.
 */
function Column({
  title,
  side,
  footnote,
}: {
  title: string;
  side: ComparisonSide;
  footnote?: string;
}) {
  const rows: Array<[string, string]> = [
    ['ROI', formatPct(side.roi, { signed: true })],
    ['P/L', formatUsd(side.pnl, { signed: true })],
    ['Win rate', formatPct(side.winRate, { decimals: 1 })],
    ['Max drawdown', formatUsd(side.maxDrawdown)],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col divide-y divide-border/60">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between py-2 text-sm">
              <dt className="text-muted">{k}</dt>
              <dd className="font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        {footnote ? <p className="mt-2 text-xs text-muted">{footnote}</p> : null}
      </CardContent>
    </Card>
  );
}

export function ComparisonPage() {
  const { address = '' } = useParams();
  const query = useTraderPerformance(address);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Performance comparison"
        description={
          <>
            Trader{' '}
            <Link className="text-accent hover:underline" to={`/traders/${address}`}>
              {shortAddress(address)}
            </Link>{' '}
            vs. your copies of this trader.
          </>
        }
      />
      <QueryBoundary query={query}>
        {(c) => (
          <div className="flex flex-col gap-4">
            <Callout variant="warning" title="Read this first" role="note">
              <span className="text-sm">{c.disclaimer}</span>
            </Callout>
            <div className="grid gap-4 sm:grid-cols-2">
              <Column title="Trader" side={c.trader} />
              <Column
                title="You"
                side={c.user}
                footnote={`Based on ${formatNumber(c.copiedTrades)} copied trade(s) of this trader.`}
              />
            </div>
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
