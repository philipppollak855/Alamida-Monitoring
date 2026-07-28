import { useMemo } from 'react';
import { useAuth } from './AuthContext';
import {
  resolveAccessPermissions,
  type AppAccessPermissions,
} from './permissions';
import { useDispositionSettings } from '../settings/SettingsProvider';

export function useAccessPermissions(): AppAccessPermissions {
  const { profile } = useAuth();
  return useMemo(
    () => resolveAccessPermissions(profile?.permissions),
    [profile?.permissions]
  );
}

/**
 * Verknüpfte Personal-ID: zuerst aus Userprofil, sonst aus Personalpool
 * (UID oder Google-E-Mail am Personeneintrag).
 */
export function useLinkedPersonId(): string | null {
  const { profile, user } = useAuth();
  const { settings } = useDispositionSettings();

  return useMemo(() => {
    const fromProfile = profile?.linkedPersonId?.trim();
    if (fromProfile) return fromProfile;

    const pool = settings.personnelPool ?? [];
    const uid = user?.uid?.trim();
    if (uid) {
      const byUid = pool.find((p) => p.linkedUserId === uid);
      if (byUid) return byUid.id;
    }

    const email = (profile?.email || user?.email || '').trim().toLowerCase();
    if (email) {
      const byEmail = pool.find(
        (p) => (p.linkedUserEmail ?? '').trim().toLowerCase() === email
      );
      if (byEmail) return byEmail.id;
    }

    return null;
  }, [profile?.linkedPersonId, profile?.email, user?.uid, user?.email, settings.personnelPool]);
}
