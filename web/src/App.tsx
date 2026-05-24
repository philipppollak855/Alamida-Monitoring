import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { SettingsProvider } from './settings/SettingsProvider';
import { ThemeProvider } from './theme/ThemeProvider';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppShell } from './layout/AppShell';
import { BoardPage } from './pages/BoardPage';
import { LoginPage } from './pages/LoginPage';
import { PendingPage } from './pages/PendingPage';
import { WallPage } from './pages/WallPage';
import { InstallPwa } from './components/InstallPwa';
import { useWidgetBadge } from './hooks/useWidgetBadge';
import { WidgetPage } from './pages/WidgetPage';
import { WidgetsHubPage } from './pages/WidgetsHubPage';

function AppBadgeSync() {
  useWidgetBadge();
  return null;
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
      <InstallPwa />
      <AppBadgeSync />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/pending" element={<PendingPage />} />
        <Route element={<ProtectedRoute />}>
          <Route
            element={
              <SettingsProvider>
                <AppShell />
              </SettingsProvider>
            }
          >
            <Route path="/" element={<Navigate to="/wall" replace />} />
            <Route path="/disposition" element={<BoardPage />} />
            <Route path="/wall" element={<WallPage />} />
            <Route path="/widgets" element={<WidgetsHubPage />} />
          </Route>
          <Route
            element={
              <SettingsProvider>
                <Outlet />
              </SettingsProvider>
            }
          >
            <Route path="/widget/:kind" element={<WidgetPage />} />
          </Route>
        </Route>
      </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}
