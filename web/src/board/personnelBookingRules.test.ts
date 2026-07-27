import { describe, expect, it } from 'vitest';
import {
  defaultRequiredTraegerCount,
  isBegraebnisEntry,
  minTraegerForEntry,
  personnelBookingSummary,
  validatePersonnelBooking,
} from './personnelBookingRules';
import type { PersonnelBooking } from '../types/personnelBooking';
import type { CalendarTerminArt } from './wallCalendar';

const sargBegraebnis = {
  arts: ['beisetzung'] as CalendarTerminArt[],
  title: 'Beisetzung',
  bestattungsMarker: 'S' as const,
};

const urneBegraebnis = {
  arts: ['beisetzung'] as CalendarTerminArt[],
  title: 'Beisetzung',
  bestattungsMarker: 'U' as const,
};

const trauerfeier = {
  arts: ['trauerfeier'] as CalendarTerminArt[],
  title: 'Trauerfeier',
  bestattungsMarker: 'S' as const,
};

describe('isBegraebnisEntry', () => {
  it('erkennt Beisetzung über arts und title', () => {
    expect(isBegraebnisEntry(sargBegraebnis)).toBe(true);
    expect(isBegraebnisEntry({ arts: [], title: 'Beisetzung' })).toBe(true);
    expect(isBegraebnisEntry(trauerfeier)).toBe(false);
  });
});

describe('minTraegerForEntry', () => {
  it('Sarg-Begräbnis ohne Familie → mind. 4', () => {
    expect(minTraegerForEntry(sargBegraebnis, false)).toBe(4);
  });

  it('Träger von Familie → 0', () => {
    expect(minTraegerForEntry(sargBegraebnis, true)).toBe(0);
  });

  it('Urne ohne Familie → 0 (variabel)', () => {
    expect(minTraegerForEntry(urneBegraebnis, false)).toBe(0);
  });

  it('kein Begräbnis → 0', () => {
    expect(minTraegerForEntry(trauerfeier, false)).toBe(0);
  });
});

describe('validatePersonnelBooking', () => {
  it('Begräbnis ohne Arrangeur ist ungültig', () => {
    const v = validatePersonnelBooking(sargBegraebnis, {
      arrangeurId: null,
      traegerIds: ['a', 'b', 'c', 'd'],
      traegerVonFamilie: false,
      requiredTraegerCount: 4,
    });
    expect(v.ok).toBe(false);
    expect(v.requiresArrangeur).toBe(true);
    expect(v.errors.some((e) => e.includes('Arrangeur'))).toBe(true);
  });

  it('Sarg ohne Familie mit weniger als 4 Trägern ist ungültig', () => {
    const v = validatePersonnelBooking(sargBegraebnis, {
      arrangeurId: 'arr-1',
      traegerIds: ['t1', 't2'],
      traegerVonFamilie: false,
      requiredTraegerCount: 4,
    });
    expect(v.ok).toBe(false);
    expect(v.minTraeger).toBe(4);
  });

  it('Sarg mit Familie braucht keine Firmenträger', () => {
    const v = validatePersonnelBooking(sargBegraebnis, {
      arrangeurId: 'arr-1',
      traegerIds: [],
      traegerVonFamilie: true,
      requiredTraegerCount: 0,
    });
    expect(v.ok).toBe(true);
  });

  it('gültige Sarg-Einbuchung mit 4 Trägern', () => {
    const v = validatePersonnelBooking(sargBegraebnis, {
      arrangeurId: 'arr-1',
      traegerIds: ['t1', 't2', 't3', 't4'],
      traegerVonFamilie: false,
      requiredTraegerCount: 4,
    });
    expect(v.ok).toBe(true);
  });

  it('defaultRequiredTraegerCount folgt Min-Regel', () => {
    expect(defaultRequiredTraegerCount(sargBegraebnis, false)).toBe(4);
    expect(defaultRequiredTraegerCount(sargBegraebnis, true)).toBe(0);
  });
});

describe('personnelBookingSummary', () => {
  it('fasst Arrangeur und Träger zusammen', () => {
    const booking: PersonnelBooking = {
      id: '1',
      docId: 'd',
      sterbefallId: 's',
      dayKey: '2026-07-27',
      entryTitle: 'Beisetzung',
      entryArts: ['beisetzung'],
      timeLabel: '14:00',
      name: 'Muster',
      arrangeurId: 'a1',
      traegerIds: ['t1', 't2', 't3', 't4'],
      traegerVonFamilie: false,
      requiredTraegerCount: 4,
    };
    expect(personnelBookingSummary(booking)).toBe('Arrangeur · 4 Träger');
    expect(
      personnelBookingSummary({ ...booking, traegerVonFamilie: true, traegerIds: [] })
    ).toBe('Arrangeur · Träger Familie');
  });
});
