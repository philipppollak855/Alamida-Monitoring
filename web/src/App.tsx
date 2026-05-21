import { Route, Routes } from 'react-router-dom';
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

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
      <InstallPwa />
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
            <Route path="/" element={<BoardPage />} />
            <Route path="/wall" element={<WallPage />} />
          </Route>
        </Route>
      </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}
