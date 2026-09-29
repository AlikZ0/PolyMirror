import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@polymirror/ui';
import { ConnectionBanner, ConnectionDot } from '../common/ConnectionStatus';
import { DemoBadge } from '../common/DemoBadge';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/scanner', label: 'Scanner' },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/activity', label: 'Activity' },
  { to: '/statistics', label: 'Statistics' },
  { to: '/settings', label: 'Settings' },
] as const;

export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2">
          <div className="flex items-center gap-3">
            <span className="text-base font-bold tracking-tight">
              <span aria-hidden="true">🐋 </span>PolyMirror
            </span>
            <DemoBadge />
          </div>
          <ConnectionDot />
        </div>
        <nav aria-label="Main" className="mx-auto max-w-7xl overflow-x-auto px-2">
          <ul className="flex gap-1">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={'end' in item ? item.end : false}
                  className={({ isActive }) =>
                    cn(
                      '-mb-px block border-b-2 px-3 py-2 text-sm whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      isActive ? 'border-accent font-medium text-fg' : 'border-transparent text-muted hover:text-fg',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <ConnectionBanner />
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5">
        <Outlet />
      </main>
      <footer className="border-t border-border px-4 py-3 text-center text-[11px] text-muted">
        PolyMirror never asks for private keys or seed phrases. Trades are only copied after your
        explicit confirmation. Not investment advice.
      </footer>
    </div>
  );
}
