import type { AppAccessPermissions } from './permissions';

export interface AppUserProfile {
  email: string;
  displayName?: string;
  photoURL?: string;
  activated: boolean;
  createdAt?: { seconds: number };
  activatedAt?: { seconds: number };
  /** Verknüpfung zum Disposition-Personalpool (`DispositionPerson.id`). */
  linkedPersonId?: string;
  /**
   * App-Rechte. Fehlt das Feld → Vollzugriff (bestehende Nutzer).
   * Neue / eingeschränkte Konten speichern ein vollständiges Objekt.
   */
  permissions?: AppAccessPermissions;
}

export type AuthGateStatus =
  | 'loading'
  | 'anonymous'
  | 'pending_activation'
  | 'activated';
