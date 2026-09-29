import { Badge, Card, CardContent, CardHeader, CardTitle } from '@polymirror/ui';
import { DemoBadge } from '../../components/common/DemoBadge';
import { useSystem } from '../../hooks/queries';
import { formatDateTime } from '../../utils/format';

export function ModeInfoSection() {
  const { data, isPending, isError } = useSystem();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mode</CardTitle>
        <DemoBadge compact />
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {isPending ? <p className="text-muted">Loading…</p> : null}
        {isError ? <p className="text-negative">Backend unreachable — mode unknown.</p> : null}
        {data ? (
          <dl className="grid grid-cols-2 gap-y-1">
            <dt className="text-muted">Data</dt>
            <dd>
              <Badge variant={data.mode === 'demo' ? 'warning' : 'info'}>{data.mode}</Badge>
            </dd>
            <dt className="text-muted">Execution</dt>
            <dd>
              {data.execution === 'demo' ? 'Demo (simulated)' : 'Assisted (you place orders)'}
            </dd>
            <dt className="text-muted">Programmatic execution</dt>
            <dd>{data.supportsProgrammaticExecution ? 'Supported' : 'Not supported'}</dd>
            <dt className="text-muted">Backend version</dt>
            <dd>{data.version}</dd>
            <dt className="text-muted">Server time</dt>
            <dd>{formatDateTime(data.serverTime)}</dd>
          </dl>
        ) : null}
        {data?.mode === 'demo' ? (
          <p className="text-xs text-demo">
            Demo mode: generated data, no real trades are executed.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function SecuritySection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Security</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex list-disc flex-col gap-1.5 pl-4 text-xs text-fg/85">
          <li>
            <strong>PolyMirror never asks for your private key or seed phrase.</strong> Anyone who
            does is trying to steal your funds.
          </li>
          <li>
            Copies are only executed after you press COPY. Reconnecting never confirms anything.
          </li>
          <li>Your amounts are always computed from your own settings, never the whale's size.</li>
          <li>
            On polymarket.com, PolyMirror only shows an information panel — it never clicks or fills
            anything.
          </li>
          <li>
            The server enforces hard safety ceilings (max per trade, daily volume, open positions).
          </li>
          <li>
            The session token stored in this browser is a PolyMirror session id, not a wallet
            credential.
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}
