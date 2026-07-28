import { useMemo } from 'react';
import { useAuth } from './AuthContext';
import {
  resolveAccessPermissions,
  type AppAccessPermissions,
} from './permissions';

export function useAccessPermissions(): AppAccessPermissions {
  const { profile } = useAuth();
  return useMemo(
    () => resolveAccessPermissions(profile?.permissions),
    [profile?.permissions]
  );
}

export function useLinkedPersonId(): string | null {
  const { profile } = useAuth();
  return profile?.linkedPersonId?.trim() || null;
}
