import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { SterbefaelleProvider } from './firestore/SterbefaelleProvider';
import { SettingsProvider } from './settings/SettingsProvider';
import { ThemeProvider } from './theme/ThemeProvider';
import { AccessRoute } from './components/AccessRoute';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppShell } from './layout/AppShell';
import { BoardPage } from './pages/BoardPage';
import { LoginPage } from './pages/LoginPage';
import { PendingPage } from './pages/PendingPage';
import { PlanningPage } from './pages/PlanningPage';
import { WallPage } from './pages/WallPage';
import { InstallPwa } from './components/InstallPwa';
import { useWidgetBadge } from './hooks/useWidgetBadge';
import { WidgetPage } from './pages/WidgetPage';
import { WidgetsHubPage } from './pages/WidgetsHubPage';
import { PUBLIC_TV_WALL_PATH } from './config/publicWall';
import { useAccessPermissions } from './auth/useAccessPermissions';
import { defaultHomePath } from './auth/permissions';

function AppBadgeSync() {
  useWidgetBadge();
  return null;
}

function HomeRedirect() {
  const access = useAccessPermissions();
  return <Navigate to={defaultHomePath(access)} replace />;
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
      <SterbefaelleProvider>
      <InstallPwa />
      <AppBadgeSync />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/pending" element={<PendingPage />} />
        <Route
          path={PUBLIC_TV_WALL_PATH}
          element={
            <SettingsProvider>
              <WallPage publicAccess legacyMode />
            </SettingsProvider>
          }
        />
        <Route element={<ProtectedRoute />}>
          <Route
            element={
              <SettingsProvider>
                <AppShell />
              </SettingsProvider>
            }
          >
            <Route path="/" element={<HomeRedirect />} />
            <Route element={<AccessRoute allow={(a) => a.canDisposition} />}>
              <Route path="/disposition" element={<BoardPage />} />
            </Route>
            <Route element={<AccessRoute allow={(a) => a.canPlan} />}>
              <Route path="/planung" element={<PlanningPage />} />
            </Route>
            <Route element={<AccessRoute allow={(a) => a.canWall} />}>
              <Route path="/wall" element={<WallPage />} />
            </Route>
            <Route element={<AccessRoute allow={(a) => a.canWidgets} />}>
              <Route path="/widgets" element={<WidgetsHubPage />} />
            </Route>
            <Route path="*" element={<HomeRedirect />} />
          </Route>
          <Route
            element={
              <SettingsProvider>
                <Outlet />
              </SettingsProvider>
            }
          >
            <Route element={<AccessRoute allow={(a) => a.canWidgets} />}>
              <Route path="/widget/:kind" element={<WidgetPage />} />
            </Route>
          </Route>
        </Route>
      </Routes>
      </SterbefaelleProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
