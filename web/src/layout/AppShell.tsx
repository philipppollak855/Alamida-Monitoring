import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAccessPermissions } from '../auth/useAccessPermissions';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { UserMenu } from '../components/UserMenu';

export function AppShell() {
  const location = useLocation();
  const isWall = location.pathname.startsWith('/wall');
  const access = useAccessPermissions();

  if (isWall) {
    return <Outlet />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="brand-mark" aria-hidden />
          <div>
            <span className="brand-title">Alamida</span>
            <span className="brand-sub">Monitoring</span>
          </div>
        </div>
        <nav className="topbar-nav" aria-label="Hauptnavigation">
          {access.canDisposition && (
            <NavLink
              to="/disposition"
              className={({ isActive }) => (isActive ? 'nav-pill active' : 'nav-pill')}
            >
              <span className="nav-label-full">Disposition</span>
              <span className="nav-label-short">Disp.</span>
            </NavLink>
          )}
          {access.canPlan && (
            <NavLink
              to="/planung"
              className={({ isActive }) => (isActive ? 'nav-pill active' : 'nav-pill')}
            >
              <span className="nav-label-full">Planung</span>
              <span className="nav-label-short">Plan</span>
            </NavLink>
          )}
          {access.canWall && (
            <NavLink
              to="/wall"
              className={({ isActive }) => (isActive ? 'nav-pill active' : 'nav-pill')}
            >
              <span className="nav-label-full">Wandmonitor</span>
              <span className="nav-label-short">Wand</span>
            </NavLink>
          )}
          {access.canWidgets && (
            <NavLink
              to="/widgets"
              className={({ isActive }) => (isActive ? 'nav-pill active' : 'nav-pill')}
            >
              <span className="nav-label-full">Widgets</span>
              <span className="nav-label-short">Widget</span>
            </NavLink>
          )}
        </nav>
        <div className="topbar-end">
          <ThemeSwitch />
          <UserMenu />
        </div>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
