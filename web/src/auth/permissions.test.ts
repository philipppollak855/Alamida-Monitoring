import { describe, expect, it } from 'vitest';
import {
  FULL_ACCESS_PERMISSIONS,
  STAFF_OWN_PERMISSIONS,
  defaultHomePath,
  resolveAccessPermissions,
  wallViewsAllowed,
} from './permissions';

describe('resolveAccessPermissions', () => {
  it('ohne Feld = Vollzugriff inkl. Benutzerverwaltung (Legacy-Admin)', () => {
    expect(resolveAccessPermissions(undefined).canManageUsers).toBe(true);
    expect(resolveAccessPermissions(null).canDisposition).toBe(true);
  });

  it('übernimmt Staff-Preset', () => {
    const p = resolveAccessPermissions(STAFF_OWN_PERMISSIONS);
    expect(p.calendarScope).toBe('own');
    expect(p.canDisposition).toBe(false);
    expect(p.canSelfConfirm).toBe(true);
    expect(p.canManageUsers).toBe(false);
    expect(p.wallTabs.kalender).toBe(true);
    expect(p.wallTabs.kuehlraum).toBe(false);
  });
});

describe('defaultHomePath / wallViewsAllowed', () => {
  it('Staff landet auf Wand', () => {
    expect(defaultHomePath(STAFF_OWN_PERMISSIONS)).toBe('/wall');
  });

  it('filtert Wand-Tabs', () => {
    expect(wallViewsAllowed(STAFF_OWN_PERMISSIONS)).toEqual(['kalender']);
    expect(
      wallViewsAllowed(FULL_ACCESS_PERMISSIONS, {
        kuehlraum: true,
        extern: false,
        kalender: true,
        abholungen: true,
        offen: true,
      })
    ).toEqual(['kuehlraum', 'kalender', 'abholungen', 'offen']);
  });
});
