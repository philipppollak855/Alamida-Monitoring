import {
  collection,
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { AppUserProfile } from '../auth/types';
import {
  serializeAccessPermissions,
  type AppAccessPermissions,
} from '../auth/permissions';
import type { DispositionPerson } from '../types/dispositionSettings';

export type ManagedUser = AppUserProfile & {
  uid: string;
};

function normalizeFirestoreMessage(err: unknown): string {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code?: string }).code ?? '')
      : '';
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (code.includes('permission-denied') || /permission/i.test(msg)) {
    return (
      'Keine Berechtigung für Benutzerverwaltung. Firestore-Rules müssen deployed sein, ' +
      'und dein Konto braucht Benutzerverwaltung (Legacy ohne permissions-Feld oder ' +
      'permissions.canManageUsers = true).'
    );
  }
  return msg || 'Unbekannter Fehler';
}

export function subscribeManagedUsers(
  onData: (users: ManagedUser[]) => void,
  onError?: (message: string) => void
): Unsubscribe {
  if (!db) {
    onError?.('Firestore nicht konfiguriert');
    return () => {};
  }
  return onSnapshot(
    collection(db, 'users'),
    (snap) => {
      const users: ManagedUser[] = snap.docs.map((d) => {
        const data = d.data() as AppUserProfile;
        return { uid: d.id, ...data };
      });
      users.sort((a, b) =>
        (a.email || '').localeCompare(b.email || '', 'de', { sensitivity: 'base' })
      );
      onData(users);
    },
    (err) => onError?.(normalizeFirestoreMessage(err))
  );
}

export type UserAccessPatch = {
  activated?: boolean;
  linkedPersonId?: string | null;
  permissions?: AppAccessPermissions;
};

/** Aktualisiert Benutzerrechte / Freischaltung / Personal-Verknüpfung. */
export async function updateManagedUser(
  uid: string,
  patch: UserAccessPatch
): Promise<void> {
  if (!db) throw new Error('Firestore nicht konfiguriert');
  const data: Record<string, unknown> = {};
  if (patch.activated !== undefined) {
    data.activated = patch.activated;
    if (patch.activated) {
      data.activatedAt = serverTimestamp();
    }
  }
  if (patch.permissions) {
    data.permissions = serializeAccessPermissions(patch.permissions);
  }
  if (patch.linkedPersonId !== undefined) {
    const id = patch.linkedPersonId?.trim();
    data.linkedPersonId = id ? id : deleteField();
  }
  if (Object.keys(data).length === 0) return;
  try {
    await updateDoc(doc(db, 'users', uid), data);
  } catch (e) {
    throw new Error(normalizeFirestoreMessage(e));
  }
}

/**
 * Setzt `linkedUserId` / `linkedUserEmail` im Personalpool bidirektional
 * (vorherige Verknüpfungen derselben UID werden gelöscht).
 */
export function applyPersonUserLink(
  pool: DispositionPerson[],
  opts: {
    userId: string;
    userEmail: string;
    personId: string | null;
  }
): DispositionPerson[] {
  const personId = opts.personId?.trim() || null;
  return pool.map((p) => {
    if (personId && p.id === personId) {
      return {
        ...p,
        linkedUserId: opts.userId,
        linkedUserEmail: opts.userEmail,
      };
    }
    if (p.linkedUserId === opts.userId) {
      const { linkedUserId: _u, linkedUserEmail: _e, ...rest } = p;
      return rest;
    }
    return p;
  });
}
