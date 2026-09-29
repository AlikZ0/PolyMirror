import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@polymirror/ui';

export function ChartCard({
  title,
  children,
  empty,
  height = 220,
  description,
}: {
  title: string;
  children: ReactNode;
  empty?: boolean;
  height?: number;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <span className="text-xs text-muted">{description}</span> : null}
      </CardHeader>
      <CardContent>
        {empty ? (
          <EmptyState title="No data for this period" className="py-6" />
        ) : (
          <div style={{ height }} role="img" aria-label={`${title} chart`}>
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
