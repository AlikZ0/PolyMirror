import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, Select, TabPanel, Tabs } from '@polymirror/ui';
import type { TimePeriod } from '@polymirror/shared';
import { QueryBoundary } from '../../components/common/QueryBoundary';
import { useTrader } from '../../hooks/queries';
import { AnalyticsTab } from './AnalyticsTab';
import { ChartsTab } from './ChartsTab';
import { HistoricalTradesTab } from './HistoricalTradesTab';
import { ProfileHeader } from './ProfileHeader';

type Tab = 'trades' | 'analytics' | 'charts';
const TAB_ID = 'trader-tabs';

export const PERIOD_OPTIONS: Array<{ value: TimePeriod; label: string }> = [
  { value: '1d', label: '1D' },
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: 'all', label: 'All' },
];

export function TraderProfilePage() {
  const { address = '' } = useParams();
  const query = useTrader(address);
  const [tab, setTab] = useState<Tab>('trades');
  const [period, setPeriod] = useState<TimePeriod>('all');

  return (
    <div className="flex flex-col gap-4">
      <QueryBoundary query={query}>
        {(profile) => <ProfileHeader profile={profile} />}
      </QueryBoundary>
      <Card>
        <CardContent className="pt-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <Tabs<Tab>
              idBase={TAB_ID}
              ariaLabel="Trader details"
              value={tab}
              onValueChange={setTab}
              items={[
                { value: 'trades', label: 'Historical trades' },
                { value: 'analytics', label: 'Analytics' },
                { value: 'charts', label: 'Charts' },
              ]}
              className="flex-1"
            />
            {tab !== 'trades' ? (
              <label className="flex items-center gap-2 text-xs text-muted">
                Period
                <Select
                  aria-label="Analytics period"
                  className="w-24"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as TimePeriod)}
                  options={PERIOD_OPTIONS}
                />
              </label>
            ) : null}
          </div>
          <TabPanel idBase={TAB_ID} value={tab}>
            {tab === 'trades' ? <HistoricalTradesTab address={address} /> : null}
            {tab === 'analytics' ? <AnalyticsTab address={address} period={period} /> : null}
            {tab === 'charts' ? <ChartsTab address={address} period={period} /> : null}
          </TabPanel>
        </CardContent>
      </Card>
    </div>
  );
}
