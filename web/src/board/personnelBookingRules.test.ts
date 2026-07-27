import { describe, expect, it } from 'vitest';
import {
  arrangeurIdsBookedOnDay,
  availableTraegerPool,
  defaultRequiredTraegerCount,
  isBegraebnisEntry,
  isPersonAbsentOnDay,
  minTraegerForEntry,
  personnelBookingSummary,
  personnelBookingTraegerLine,
  personUnavailableReason,
  unavailableReasonLabel,
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

  it('Arrangeur darf nicht zugleich Träger sein', () => {
    const v = validatePersonnelBooking(sargBegraebnis, {
      arrangeurId: 'arr-1',
      traegerIds: ['arr-1', 't2', 't3', 't4'],
      traegerVonFamilie: false,
      requiredTraegerCount: 4,
    });
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.includes('nicht als Träger'))).toBe(true);
  });

  it('defaultRequiredTraegerCount folgt Min-Regel', () => {
    expect(defaultRequiredTraegerCount(sargBegraebnis, false)).toBe(4);
    expect(defaultRequiredTraegerCount(sargBegraebnis, true)).toBe(0);
  });
});

describe('availableTraegerPool / arrangeurIdsBookedOnDay', () => {
  it('schließt gewählten Arrangeur aus dem Trägerpool aus', () => {
    const pool = [
      { id: 'a1', name: 'Alex' },
      { id: 't1', name: 'Tom' },
      { id: 't2', name: 'Tina' },
    ];
    expect(
      availableTraegerPool(pool, { selectedArrangeurId: 'a1' }).map((p) => p.id)
    ).toEqual(['t1', 't2']);
  });

  it('schließt Arrangeure anderer Buchungen am selben Tag aus', () => {
    const booked = arrangeurIdsBookedOnDay(
      {
        'entry-1': { dayKey: '2026-07-27', arrangeurId: 'a1' },
        'entry-2': { dayKey: '2026-07-27', arrangeurId: 'a2' },
        'entry-3': { dayKey: '2026-07-28', arrangeurId: 'a3' },
      },
      '2026-07-27',
      'entry-1'
    );
    expect([...booked].sort()).toEqual(['a2']);
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

describe('personnelBookingTraegerLine', () => {
  const pool = [
    { id: 't1', name: 'Anna' },
    { id: 't2', name: 'Bert' },
    { id: 't3', name: 'Clara' },
    { id: 't4', name: 'Dirk' },
  ];

  it('listet Trägernamen unter dem Termin', () => {
    expect(
      personnelBookingTraegerLine(
        {
          id: '1',
          docId: 'd',
          sterbefallId: 's',
          dayKey: '2026-07-27',
          entryTitle: 'Beisetzung',
          entryArts: ['beisetzung'],
          timeLabel: '14:00',
          name: 'Muster',
          arrangeurId: 'a1',
          traegerIds: ['t1', 't3'],
          traegerVonFamilie: false,
          requiredTraegerCount: 2,
        },
        pool
      )
    ).toBe('Anna, Clara');
  });

  it('zeigt Träger Familie', () => {
    expect(
      personnelBookingTraegerLine(
        {
          id: '1',
          docId: 'd',
          sterbefallId: 's',
          dayKey: '2026-07-27',
          entryTitle: 'Beisetzung',
          entryArts: ['beisetzung'],
          timeLabel: '14:00',
          name: 'Muster',
          arrangeurId: 'a1',
          traegerIds: [],
          traegerVonFamilie: true,
          requiredTraegerCount: 0,
        },
        pool
      )
    ).toBe('Träger Familie');
  });
});

describe('Abwesenheiten / Nicht verfügbar', () => {
  it('erkennt Abwesenheit im inklusiven Tagesbereich', () => {
    const absences = {
      a1: {
        personId: 'p1',
        fromDayKey: '2026-07-26',
        toDayKey: '2026-07-28',
      },
    };
    expect(isPersonAbsentOnDay(absences, 'p1', '2026-07-26')).toBe(true);
    expect(isPersonAbsentOnDay(absences, 'p1', '2026-07-27')).toBe(true);
    expect(isPersonAbsentOnDay(absences, 'p1', '2026-07-28')).toBe(true);
    expect(isPersonAbsentOnDay(absences, 'p1', '2026-07-29')).toBe(false);
    expect(isPersonAbsentOnDay(absences, 'p2', '2026-07-27')).toBe(false);
  });

  it('personUnavailableReason priorisiert Abwesenheit', () => {
    const reason = personUnavailableReason('p1', '2026-07-27', {
      absences: {
        a1: { personId: 'p1', fromDayKey: '2026-07-27', toDayKey: '2026-07-27' },
      },
      bookings: {
        b1: {
          dayKey: '2026-07-27',
          arrangeurId: 'p1',
          traegerIds: [],
        },
      },
    });
    expect(reason).toBe('absent');
    expect(unavailableReasonLabel('absent')).toBe('Abwesend');
  });

  it('blockiert bereits eingebuchten Arrangeur', () => {
    expect(
      personUnavailableReason('arr-1', '2026-07-27', {
        bookings: {
          b1: {
            dayKey: '2026-07-27',
            arrangeurId: 'arr-1',
            traegerIds: ['t1'],
          },
        },
        asRole: 'traeger',
      })
    ).toBe('booked-arrangeur');
  });
});
