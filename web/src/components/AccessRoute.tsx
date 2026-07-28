import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { defaultHomePath } from '../auth/permissions';
import { useAccessPermissions } from '../auth/useAccessPermissions';

/** Leitet aktivierte Nutzer ohne Recht für die aktuelle Route um. */
export function AccessRoute({
  allow,
}: {
  allow: (access: ReturnType<typeof useAccessPermissions>) => boolean;
}) {
  const { status } = useAuth();
  const access = useAccessPermissions();
  const location = useLocation();

  if (status !== 'activated') {
    return <Outlet />;
  }

  if (!allow(access)) {
    return <Navigate to={defaultHomePath(access)} replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
