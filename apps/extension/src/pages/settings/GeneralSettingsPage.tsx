import { ApiSection } from './ApiSection';
import { NotificationSection } from './NotificationSection';
import { ModeInfoSection, SecuritySection } from './InfoSections';

export function GeneralSettingsPage() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ApiSection />
      <ModeInfoSection />
      <NotificationSection />
      <SecuritySection />
    </div>
  );
}
