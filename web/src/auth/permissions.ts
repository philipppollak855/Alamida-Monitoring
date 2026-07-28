import type { WallView } from '../hooks/useWallTabRotation';

/** Kalender-/Termin-Sicht: alles oder nur eigene Einbuchungen. */
export type CalendarScope = 'all' | 'own';

export type WallTabAccess = Record<WallView, boolean>;

/**
 * Feingranulare App-Rechte für aktivierte Benutzer.
 * Fehlendes `permissions`-Feld am Profil = Vollzugriff (Rückwärtskompatibilität).
 */
export type AppAccessPermissions = {
  calendarScope: CalendarScope;
  canDisposition: boolean;
  canPlan: boolean;
  canWall: boolean;
  canWidgets: boolean;
  /** Fälle abschließen / aus Disposition entfernen / Duplikate bereinigen */
  canDeleteCases: boolean;
  /** Disposition-Einstellungen (Keywords, Kühlräume, Personalpool) */
  canManageSettings: boolean;
  /** Benutzer freischalten, verknüpfen, Rechte setzen */
  canManageUsers: boolean;
  /** Personal für andere einbuchen (Arrangeur/Träger/Fahrer wählen) */
  canBookPersonnel: boolean;
  /** Eigene Einbuchung selbst bestätigen */
  canSelfConfirm: boolean;
  /** Sich in bestehende Bereitschaften eintragen / austragen */
  canSelfStandby: boolean;
  wallTabs: WallTabAccess;
};

export const FULL_WALL_TABS: WallTabAccess = {
  kuehlraum: true,
  extern: true,
  kalender: true,
  abholungen: true,
  offen: true,
};

export const FULL_ACCESS_PERMISSIONS: AppAccessPermissions = {
  calendarScope: 'all',
  canDisposition: true,
  canPlan: true,
  canWall: true,
  canWidgets: true,
  canDeleteCases: true,
  canManageSettings: true,
  /** Muss explizit gesetzt werden — sonst wäre jeder Legacy-Nutzer Admin. */
  canManageUsers: false,
  canBookPersonnel: true,
  canSelfConfirm: true,
  canSelfStandby: true,
  wallTabs: { ...FULL_WALL_TABS },
};

/** Voreinstellung „Vollzugriff“ inkl. Benutzerverwaltung (Admin-Preset). */
export const ADMIN_FULL_PERMISSIONS: AppAccessPermissions = {
  ...FULL_ACCESS_PERMISSIONS,
  canManageUsers: true,
  wallTabs: { ...FULL_WALL_TABS },
};

/** Voreinstellung für verknüpftes Personal (nur eigene Termine). */
export const STAFF_OWN_PERMISSIONS: AppAccessPermissions = {
  calendarScope: 'own',
  canDisposition: false,
  canPlan: false,
  canWall: true,
  canWidgets: false,
  canDeleteCases: false,
  canManageSettings: false,
  canManageUsers: false,
  canBookPersonnel: false,
  canSelfConfirm: true,
  canSelfStandby: true,
  wallTabs: {
    kuehlraum: false,
    extern: false,
    kalender: true,
    abholungen: false,
    offen: false,
  },
};

export type AccessPermissionPreset = 'full' | 'staffOwn';

export function permissionsForPreset(preset: AccessPermissionPreset): AppAccessPermissions {
  return preset === 'staffOwn'
    ? { ...STAFF_OWN_PERMISSIONS, wallTabs: { ...STAFF_OWN_PERMISSIONS.wallTabs } }
    : { ...ADMIN_FULL_PERMISSIONS, wallTabs: { ...FULL_WALL_TABS } };
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function normalizeWallTabs(raw: unknown, fallback: WallTabAccess): WallTabAccess {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    kuehlraum: asBool(src.kuehlraum, fallback.kuehlraum),
    extern: asBool(src.extern, fallback.extern),
    kalender: asBool(src.kalender, fallback.kalender),
    abholungen: asBool(src.abholungen, fallback.abholungen),
    offen: asBool(src.offen, fallback.offen),
  };
}

/**
 * Effektive Rechte. Ohne gespeichertes `permissions`-Objekt → Vollzugriff inkl.
 * Benutzerverwaltung (bestehende aktivierte Konten bleiben Admins).
 * Eingeschränkte Konten speichern ein explizites `permissions`-Objekt.
 */
export function resolveAccessPermissions(
  raw: Partial<AppAccessPermissions> | null | undefined
): AppAccessPermissions {
  if (!raw || typeof raw !== 'object') {
    return {
      ...ADMIN_FULL_PERMISSIONS,
      wallTabs: { ...FULL_WALL_TABS },
    };
  }
  const base = FULL_ACCESS_PERMISSIONS;
  return {
    calendarScope: raw.calendarScope === 'own' ? 'own' : 'all',
    canDisposition: asBool(raw.canDisposition, base.canDisposition),
    canPlan: asBool(raw.canPlan, base.canPlan),
    canWall: asBool(raw.canWall, base.canWall),
    canWidgets: asBool(raw.canWidgets, base.canWidgets),
    canDeleteCases: asBool(raw.canDeleteCases, base.canDeleteCases),
    canManageSettings: asBool(raw.canManageSettings, base.canManageSettings),
    canManageUsers: asBool(raw.canManageUsers, base.canManageUsers),
    canBookPersonnel: asBool(raw.canBookPersonnel, base.canBookPersonnel),
    canSelfConfirm: asBool(raw.canSelfConfirm, base.canSelfConfirm),
    canSelfStandby: asBool(raw.canSelfStandby, base.canSelfStandby),
    wallTabs: normalizeWallTabs(raw.wallTabs, base.wallTabs),
  };
}

/** Firestore-sichere Kopie ohne undefined. */
export function serializeAccessPermissions(
  p: AppAccessPermissions
): AppAccessPermissions {
  return {
    calendarScope: p.calendarScope,
    canDisposition: p.canDisposition,
    canPlan: p.canPlan,
    canWall: p.canWall,
    canWidgets: p.canWidgets,
    canDeleteCases: p.canDeleteCases,
    canManageSettings: p.canManageSettings,
    canManageUsers: p.canManageUsers,
    canBookPersonnel: p.canBookPersonnel,
    canSelfConfirm: p.canSelfConfirm,
    canSelfStandby: p.canSelfStandby,
    wallTabs: { ...p.wallTabs },
  };
}

export function defaultHomePath(p: AppAccessPermissions): string {
  if (p.canWall) return '/wall';
  if (p.canDisposition) return '/disposition';
  if (p.canPlan) return '/planung';
  if (p.canWidgets) return '/widgets';
  return '/pending';
}

export function wallViewsAllowed(
  p: AppAccessPermissions,
  rotationEnabled?: Partial<Record<WallView, boolean>> | null
): WallView[] {
  const order: WallView[] = ['kuehlraum', 'extern', 'kalender', 'abholungen', 'offen'];
  return order.filter((v) => (rotationEnabled?.[v] ?? true) && (p.wallTabs[v] ?? true));
}
