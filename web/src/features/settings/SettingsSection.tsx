import type { ReactNode } from 'react';
import { Card, CardHeader } from '../../ui/misc';

export function SettingsSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={hint} />
      <div className="grid gap-5 p-5">{children}</div>
    </Card>
  );
}
