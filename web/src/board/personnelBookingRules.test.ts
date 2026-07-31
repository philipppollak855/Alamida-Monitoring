import { describe, expect, it } from 'vitest';
import {
  arrangeurIdsBookedOnDay,
  availableTraegerPool,
  defaultRequiredTraegerCount,
  isBegraebnisEntry,
  isPersonAbsentAtTime,
  isPersonAbsentOnDay,
  minTraegerForEntry,
  parseTimeLabelMinutes,
  personnelAttentionForEntry,
  personnelBookingDisplayLine,
  personnelBookingSummary,
  personnelBookingTraegerLine,
  personUnavailableReason,
  timesConflictWithinMinutes,
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

  it('Sarg ohne Familie mit weniger als 4 Trägern speicherbar, aber Personal offen', () => {
    const v = validatePersonnelBooking(sargBegraebnis, {
      arrangeurId: 'arr-1',
      traegerIds: ['t1', 't2'],
      traegerVonFamilie: false,
      requiredTraegerCount: 4,
    });
    expect(v.ok).toBe(true);
    expect(v.minTraeger).toBe(4);
    expect(v.warnings.some((w) => w.includes('Personal offen'))).toBe(true);
  });

  it('mind. Träger ohne Einbuchung speicherbar, Warnung Personal offen', () => {
    const v = validatePersonnelBooking(sargBegraebnis, {
      arrangeurId: 'arr-1',
      traegerIds: [],
      traegerVonFamilie: false,
      requiredTraegerCount: 4,
    });
    expect(v.ok).toBe(true);
    expect(v.warnings.some((w) => w.includes('Personal offen'))).toBe(true);
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
    expect(
      personnelBookingSummary({ ...booking, traegerIds: [], requiredTraegerCount: 4 })
    ).toBe('Arrangeur · Personal offen');
    expect(
      personnelBookingDisplayLine(
        { ...booking, traegerIds: [], requiredTraegerCount: 4, bestattungsMarker: 'S' },
        [{ id: 'a1', name: 'Alex' }]
      )
    ).toBe('Arr. Alex · Personal offen');
  });

  it('zeigt Fahrer bei Überführungsbuchung', () => {
    const booking: PersonnelBooking = {
      id: '1',
      docId: 'd',
      sterbefallId: 's',
      dayKey: '2026-07-27',
      entryTitle: 'Überführung',
      entryArts: ['ueberfuehrung'],
      timeLabel: '09:00',
      name: 'Muster',
      arrangeurId: null,
      traegerIds: ['f1'],
      traegerVonFamilie: false,
      requiredTraegerCount: 0,
    };
    expect(personnelBookingSummary(booking)).toBe('1 Fahrer');
    expect(
      personnelBookingDisplayLine(booking, [{ id: 'f1', name: 'Franz' }])
    ).toBe('Fahrer Franz');
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

  it('markiert externe Träger in der Anzeigezeile', () => {
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
          traegerIds: ['t1', 't2'],
          traegerVonFamilie: false,
          requiredTraegerCount: 2,
        },
        [
          { id: 't1', name: 'Anna' },
          { id: 't2', name: 'Bernd', extern: true },
        ]
      )
    ).toBe('Anna, Bernd');
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

  it('stundenweise Abwesenheit nur im Zeitfenster', () => {
    const absences = {
      a1: {
        personId: 'p1',
        fromDayKey: '2026-07-27',
        toDayKey: '2026-07-27',
        fromTime: '09:00',
        toTime: '12:00',
      },
    };
    expect(isPersonAbsentAtTime(absences, 'p1', '2026-07-27', '10:00')).toBe(true);
    expect(isPersonAbsentAtTime(absences, 'p1', '2026-07-27', '14:00')).toBe(false);
    expect(isPersonAbsentAtTime(absences, 'p1', '2026-07-27', null)).toBe(true);
    expect(
      personUnavailableReason('p1', '2026-07-27', {
        absences,
        timeLabel: '14:00',
      })
    ).toBeNull();
    expect(
      personUnavailableReason('p1', '2026-07-27', {
        absences,
        timeLabel: '09:30',
      })
    ).toBe('absent');
  });

  it('mehrtaegige stundenweise Abwesenheit deckt Zwischentage ganz', () => {
    const absences = {
      a1: {
        personId: 'p1',
        fromDayKey: '2026-07-26',
        toDayKey: '2026-07-28',
        fromTime: '14:00',
        toTime: '10:00',
      },
    };
    expect(isPersonAbsentAtTime(absences, 'p1', '2026-07-26', '13:00')).toBe(false);
    expect(isPersonAbsentAtTime(absences, 'p1', '2026-07-26', '15:00')).toBe(true);
    expect(isPersonAbsentAtTime(absences, 'p1', '2026-07-27', '08:00')).toBe(true);
    expect(isPersonAbsentAtTime(absences, 'p1', '2026-07-28', '09:00')).toBe(true);
    expect(isPersonAbsentAtTime(absences, 'p1', '2026-07-28', '11:00')).toBe(false);
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
          timeLabel: '14:00',
        },
      },
      timeLabel: '14:00',
    });
    expect(reason).toBe('absent');
    expect(unavailableReasonLabel('absent')).toBe('Abwesend');
  });

  it('blockiert nur bei Zeitkonflikt ±30 Min, nicht den ganzen Tag', () => {
    const bookings = {
      b1: {
        dayKey: '2026-07-27',
        arrangeurId: 'arr-1',
        traegerIds: ['t1'],
        timeLabel: '14:00',
      },
    };
    expect(
      personUnavailableReason('arr-1', '2026-07-27', {
        bookings,
        asRole: 'arrangeur',
        timeLabel: '14:20',
      })
    ).toBe('booked-arrangeur');
    expect(
      personUnavailableReason('arr-1', '2026-07-27', {
        bookings,
        asRole: 'arrangeur',
        timeLabel: '15:00',
      })
    ).toBeNull();
    expect(
      personUnavailableReason('t1', '2026-07-27', {
        bookings,
        asRole: 'traeger',
        timeLabel: '13:45',
      })
    ).toBe('booked-traeger');
    expect(
      personUnavailableReason('t1', '2026-07-27', {
        bookings,
        asRole: 'traeger',
        timeLabel: '16:00',
      })
    ).toBeNull();
  });
});

describe('parseTimeLabelMinutes / timesConflictWithinMinutes', () => {
  it('parst Uhrzeiten und erkennt ±30-Min-Fenster', () => {
    expect(parseTimeLabelMinutes('14:00')).toBe(14 * 60);
    expect(parseTimeLabelMinutes('9.30 Uhr')).toBe(9 * 60 + 30);
    expect(timesConflictWithinMinutes('14:00', '14:30')).toBe(true);
    expect(timesConflictWithinMinutes('14:00', '14:31')).toBe(false);
  });
});

describe('validatePersonnelBooking Warnung ohne Arrangeur-Rolle', () => {
  it('warnt wenn gewählte Person kein Arrangeur ist', () => {
    const v = validatePersonnelBooking(
      sargBegraebnis,
      {
        arrangeurId: 't-only',
        traegerIds: ['t1', 't2', 't3', 't4'],
        traegerVonFamilie: false,
        requiredTraegerCount: 4,
      },
      {
        personnelPool: [
          { id: 't-only', name: 'Tom', roles: ['traeger'] },
          { id: 't1', name: 'A', roles: ['traeger'] },
          { id: 't2', name: 'B', roles: ['traeger'] },
          { id: 't3', name: 'C', roles: ['traeger'] },
          { id: 't4', name: 'D', roles: ['traeger'] },
        ],
      }
    );
    expect(v.ok).toBe(true);
    expect(v.warnings.some((w) => w.includes('kein Arrangeur'))).toBe(true);
  });
});

describe('personnelAttentionForEntry', () => {
  it('offen ohne Buchung, Bestätigung bei Extern', () => {
    expect(personnelAttentionForEntry(sargBegraebnis, null, [])).toBe('open');
    expect(personnelAttentionForEntry(trauerfeier, null, [])).toBe('open');
    expect(
      personnelAttentionForEntry(
        { arts: ['aufnahme'] as CalendarTerminArt[], title: 'Aufnahme' },
        null,
        []
      )
    ).toBeNull();

    const booking: PersonnelBooking = {
      id: 'b1',
      docId: 'd1',
      sterbefallId: 's1',
      dayKey: '2026-07-31',
      entryTitle: 'Beisetzung',
      entryArts: ['beisetzung'],
      timeLabel: '14:00',
      name: 'Test',
      bestattungsMarker: 'S',
      arrangeurId: 'arr-1',
      traegerIds: ['ext-1', 't2', 't3', 't4'],
      traegerVonFamilie: false,
      requiredTraegerCount: 4,
      confirmedPersonIds: [],
    };
    const pool = [
      { id: 'arr-1', name: 'Arr', extern: false },
      { id: 'ext-1', name: 'Extern', extern: true },
      { id: 't2', name: 'T2' },
      { id: 't3', name: 'T3' },
      { id: 't4', name: 'T4' },
    ];
    expect(personnelAttentionForEntry(sargBegraebnis, booking, pool)).toBe('confirm');
    expect(
      personnelAttentionForEntry(
        sargBegraebnis,
        { ...booking, confirmedPersonIds: ['ext-1'] },
        pool
      )
    ).toBeNull();
  });
});
