import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { ActivityPage } from './activity/ActivityPage';
import { ComparisonPage } from './comparison/ComparisonPage';
import { ConfirmRoute } from './confirm/ConfirmRoute';
import { DashboardPage } from './dashboard/DashboardPage';
import { ScannerPage } from './scanner/ScannerPage';
import { SettingsLayout } from './settings/SettingsLayout';
import { GeneralSettingsPage } from './settings/GeneralSettingsPage';
import { CopySettingsPage } from './copy-settings/CopySettingsPage';
import { StatisticsPage } from './statistics/StatisticsPage';
import { TraderProfilePage } from './trader/TraderProfilePage';
import { WatchlistPage } from './watchlist/WatchlistPage';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="confirm/:id" element={<ConfirmRoute />} />
          <Route path="scanner" element={<ScannerPage />} />
          <Route path="traders/:address" element={<TraderProfilePage />} />
          <Route path="compare/:address" element={<ComparisonPage />} />
          <Route path="watchlist" element={<WatchlistPage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="statistics" element={<StatisticsPage />} />
          <Route path="settings" element={<SettingsLayout />}>
            <Route index element={<GeneralSettingsPage />} />
            <Route path="copy" element={<CopySettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
