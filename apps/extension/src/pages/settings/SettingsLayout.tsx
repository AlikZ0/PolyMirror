import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@polymirror/ui';
import { PageHeader } from '../../components/common/PageHeader';

const TABS = [
  { to: '/settings', label: 'General', end: true },
  { to: '/settings/copy', label: 'Copy Settings', end: false },
];

export function SettingsLayout() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Settings" />
      <nav aria-label="Settings sections" className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cn(
                '-mb-px border-b-2 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                isActive ? 'border-accent font-medium text-fg' : 'border-transparent text-muted hover:text-fg',
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
