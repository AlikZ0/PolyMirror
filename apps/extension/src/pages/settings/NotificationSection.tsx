import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Switch } from '@polymirror/ui';
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from '../../types/settings';
import { getItem, setItem } from '../../utils/storage';

const LABELS: Record<keyof NotificationPrefs, { label: string; description: string }> = {
  whaleTrade: {
    label: 'New whale trades',
    description: 'A followed trader opened a position you can copy.',
  },
  copySuccess: { label: 'Copy succeeded', description: 'Your copy order was confirmed.' },
  copyFailed: { label: 'Copy failed', description: 'Your copy could not be executed.' },
  dailyLimit: { label: 'Daily limit reached', description: 'Your max daily amount has been used.' },
  connectionLost: {
    label: 'Connection lost',
    description: 'The realtime connection has been down for 30s.',
  },
  traderStatus: {
    label: 'Trader status changes',
    description: 'A followed trader became inactive.',
  },
  other: { label: 'Other alerts', description: 'Market unavailable, insufficient balance, …' },
};

export function NotificationSection() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);

  useEffect(() => {
    void getItem('notificationPrefs').then((p) =>
      setPrefs({ ...DEFAULT_NOTIFICATION_PREFS, ...p }),
    );
  }, []);

  const toggle = (key: keyof NotificationPrefs, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    void setItem('notificationPrefs', next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Desktop notifications</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {(Object.keys(LABELS) as Array<keyof NotificationPrefs>).map((key) => (
          <Switch
            key={key}
            checked={prefs[key]}
            onCheckedChange={(v) => toggle(key, v)}
            label={LABELS[key].label}
            description={LABELS[key].description}
          />
        ))}
      </CardContent>
    </Card>
  );
}
