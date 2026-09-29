import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SystemInfo } from '@polymirror/shared';
import {
  Button,
  Callout,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
} from '@polymirror/ui';
import { ConnectionDot } from '../../components/common/ConnectionStatus';
import { errorMessage } from '../../components/common/QueryBoundary';
import { DEFAULT_API_URL, stripTrailingSlash } from '../../config';
import { requestReconnect } from '../../hooks/useBackgroundBridge';
import { createApiClient } from '../../services/apiClient';
import { resetSession } from '../../services/session';
import { useConnectionStore } from '../../stores/connectionStore';
import { getItem, removeItem, setItem } from '../../utils/storage';

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

type TestResult =
  { ok: true; info: SystemInfo; ms: number } | { ok: false; message: string } | null;

export function ApiSection() {
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<TestResult>(null);
  const [testing, setTesting] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const snapshot = useConnectionStore((s) => s.snapshot);

  useEffect(() => {
    void getItem('apiUrlOverride').then((v) => {
      setSavedUrl(v);
      setUrl(v ?? '');
    });
  }, []);

  const effective = savedUrl ?? DEFAULT_API_URL;

  const save = async () => {
    const v = url.trim();
    if (v && !isHttpUrl(v)) {
      setError('Enter a valid http(s) URL, e.g. https://api.example.com');
      return;
    }
    setError(null);
    if (v) await setItem('apiUrlOverride', stripTrailingSlash(v));
    else await removeItem('apiUrlOverride');
    setSavedUrl(v ? stripTrailingSlash(v) : null);
    // A different backend means a different session.
    await resetSession();
    await qc.invalidateQueries();
  };

  const runTest = async () => {
    const target = url.trim() || effective;
    if (!isHttpUrl(target)) {
      setTest({ ok: false, message: 'Invalid URL' });
      return;
    }
    setTesting(true);
    const started = performance.now();
    try {
      const client = createApiClient({
        getBaseUrl: () => target,
        getToken: async () => null,
        timeoutMs: 8_000,
      });
      const info = await client.request<SystemInfo>('GET', '/api/system', { auth: false });
      setTest({ ok: true, info, ms: Math.round(performance.now() - started) });
    } catch (e) {
      setTest({ ok: false, message: errorMessage(e) });
    } finally {
      setTesting(false);
    }
  };

  const reset = async () => {
    await resetSession();
    setResetDone(true);
    requestReconnect();
    await qc.invalidateQueries();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Backend connection</CardTitle>
        <ConnectionDot />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Field
          label="API URL override"
          htmlFor="settings-api-url"
          hint={`Leave empty to use the built-in default (${DEFAULT_API_URL}). WebSocket: same host, path /ws.`}
          error={error ?? undefined}
        >
          <Input
            id="settings-api-url"
            type="url"
            value={url}
            placeholder={DEFAULT_API_URL}
            invalid={!!error}
            onChange={(e) => setUrl(e.target.value)}
          />
        </Field>
        <p className="text-xs text-muted">
          In use: <span className="font-mono">{effective}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void save()}>Save URL</Button>
          <Button variant="secondary" loading={testing} onClick={() => void runTest()}>
            Test connection
          </Button>
          <Button variant="ghost" onClick={requestReconnect}>
            Reconnect realtime
          </Button>
        </div>
        {test?.ok ? (
          <Callout variant="success" role="status">
            Reachable in {test.ms} ms — v{test.info.version}, {test.info.mode} data,{' '}
            {test.info.execution} execution.
          </Callout>
        ) : test && !test.ok ? (
          <Callout variant="danger" role="alert">
            {test.message}
          </Callout>
        ) : null}
        {snapshot?.lastError && snapshot.state !== 'authenticated' ? (
          <p className="text-xs text-muted">Realtime: {snapshot.lastError}</p>
        ) : null}
        <hr className="border-border" />
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted">
            The session token identifies this browser to PolyMirror. It is not a wallet key.
            Resetting creates a new anonymous session (your settings and history on the server stay
            with the old one).
          </p>
          <div>
            <Button variant="danger" size="sm" onClick={() => void reset()}>
              Reset session token
            </Button>
          </div>
          {resetDone ? (
            <p role="status" className="text-xs text-positive">
              Session reset. A new session is created automatically.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
