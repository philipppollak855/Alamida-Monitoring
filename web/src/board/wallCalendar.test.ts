import { describe, it, expect } from 'vitest';
import { currentWeekDayRange } from './monthScrollWindow';
import {
  attachTransfersToCeremonyEntries,
  buildMonthOverviewGrid,
  buildWallCalendarDaysInRange,
  buildWallCalendarEntries,
  calendarColorGroupFromArts,
  filterEntriesInDayRange,
  isFahrerTransferEntry,
  isKremationTransferEntry,
  mergeTransferPlanIntoEntries,
  summarizeWallCalendarDay,
  type WallCalendarEntry,
} from './wallCalendar';

function entry(arts: WallCalendarEntry['arts']): WallCalendarEntry {
  return {
    id: '1',
    docId: '1',
    sterbefallId: '1',
    dayKey: '2026-05-28',
    dayLabel: '',
    timeLabel: '10:00',
    sortMs: 0,
    name: 'Test',
    title: 'T',
    subtitle: '',
    badges: [],
    grouped: false,
    arts,
    searchText: '',
  };
}

describe('Aufnahme-Termine', () => {
  it('erstellt Kalendereintrag aus Trauergespräch-Feldern', () => {
    const entries = buildWallCalendarEntries([
      {
        id: 'doc-1',
        sterbefallId: '260112',
        verstorbenerName: 'Hedwig Freis',
        aufnahmedatum: '10.06.2026',
        aufnahmezeit: '14:00',
        aufnahmeort: 'Grafenbach - Zentrale',
      },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.name).toBe('Aufnahme - Hedwig Freis');
    expect(entries[0]?.arts).toEqual(['aufnahme']);
    expect(entries[0]?.timeLabel).toBe('14:00');
    expect(entries[0]?.subtitle).toBe('Grafenbach - Zentrale');
    expect(calendarColorGroupFromArts(['aufnahme'])).toBe('aufnahme');
  });
});

describe('summarizeWallCalendarDay', () => {
  it('zählt Termine und Überführungen getrennt', () => {
    const summary = summarizeWallCalendarDay([
      entry(['trauerfeier']),
      entry(['ueberfuehrung']),
      entry(['ueberfuehrung_kremation']),
    ]);
    expect(summary).toEqual({ total: 3, ueberfuehrungen: 2 });
  });

  it('zählt zugehörige Überführung nicht separat', () => {
    const summary = summarizeWallCalendarDay([
      {
        ...entry(['beisetzung', 'ueberfuehrung']),
        attachedTransfer: true,
      },
    ]);
    expect(summary).toEqual({ total: 1, ueberfuehrungen: 0 });
  });
});

describe('attachTransfersToCeremonyEntries', () => {
  it('hängt Überführung am gleichen Tag an Beisetzung', () => {
    const entries = buildWallCalendarEntries([
      {
        id: 'doc-s',
        sterbefallId: '260999',
        verstorbenerName: 'Sulzer Test',
        beisetzungsdatum: '30.07.2026',
        beisetzungszeit: '14:00',
        endziel: 'Friedhof',
        ausstehend: [
          {
            zeile: 1,
            schrittTyp: 'ueberfuehrung',
            vonOrt: 'Kühlr. Grafenbach',
            nachOrt: 'Friedhof',
            terminAm: '30.07.2026 10:00',
            status: 'geplant',
          },
        ],
      },
    ]);

    expect(entries.length).toBe(1);
    expect(entries[0]?.arts).toContain('beisetzung');
    expect(entries[0]?.arts).toContain('ueberfuehrung');
    expect(entries[0]?.attachedTransfer).toBe(true);
    expect(entries[0]?.badges.some((b) => /Überf/i.test(b))).toBe(true);

    const merged = attachTransfersToCeremonyEntries([
      {
        ...entry(['beisetzung']),
        id: 'c1',
        docId: 'd1',
        dayKey: '2026-07-30',
        title: 'Beisetzung',
      },
      {
        ...entry(['ueberfuehrung']),
        id: 't1',
        docId: 'd1',
        dayKey: '2026-07-30',
        title: 'Überführung',
        subtitle: 'KR → Friedhof',
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('c1');
    expect(merged[0]?.attachedTransfer).toBe(true);
  });
});

describe('Monats-Eintragsraster', () => {
  it('zeigt nur Tage im geladenen Fenster', () => {
    const anchor = new Date(2026, 4, 28);
    const week = currentWeekDayRange(anchor);
    const entries: WallCalendarEntry[] = [
      { ...entry(['trauerfeier']), id: 'jan', dayKey: '2026-01-01' },
      { ...entry(['trauerfeier']), id: 'today', dayKey: '2026-05-28' },
    ];
    const filtered = filterEntriesInDayRange(entries, week.fromKey, week.toKey);
    const days = buildWallCalendarDaysInRange(filtered, anchor, week.fromKey, week.toKey);
    expect(days).toHaveLength(7);
    expect(days.some((d) => d.dayKey === '2026-01-01')).toBe(false);
    expect(days.some((d) => d.dayKey === '2026-05-28')).toBe(true);
  });
});

describe('buildMonthOverviewGrid', () => {
  it('füllt Mo–So-Raster mit führenden Leerzellen (Monat beginnt Mi)', () => {
    const anchor = new Date(2026, 3, 10);
    const grid = buildMonthOverviewGrid([], anchor, '2026-04-10');
    expect(grid.weekdayLabels).toEqual(['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']);
    expect(grid.cells[0]).toBeNull();
    expect(grid.cells[1]).toBeNull();
    expect(grid.cells[2]?.dayKey).toBe('2026-04-01');
    expect(grid.cells.filter((c) => c !== null)).toHaveLength(30);
  });

  it('rundet die letzte Woche mit Leerzellen ab', () => {
    const anchor = new Date(2026, 5, 1);
    const grid = buildMonthOverviewGrid([], anchor, '2026-06-01');
    expect(grid.cells[0]?.dayKey).toBe('2026-06-01');
    expect(grid.cells.at(-1)).toBeNull();
    expect(grid.cells.length % 7).toBe(0);
  });
});

describe('isKremationTransferEntry / isFahrerTransferEntry', () => {
  it('erkennt Standard-Kremationsüberführung', () => {
    expect(isKremationTransferEntry(entry(['ueberfuehrung_kremation']))).toBe(true);
    expect(isFahrerTransferEntry(entry(['ueberfuehrung_kremation']))).toBe(false);
  });

  it('normale Überführung braucht Fahrer-Pool', () => {
    expect(isKremationTransferEntry(entry(['ueberfuehrung']))).toBe(false);
    expect(isFahrerTransferEntry(entry(['ueberfuehrung']))).toBe(true);
  });
});

describe('mergeTransferPlanIntoEntries', () => {
  it('zeigt Kremation aus Alamida + Planung nur einmal', () => {
    const sterbefaelle = [
      {
        id: 'doc-krem',
        sterbefallId: '260777',
        verstorbenerName: 'Krem Test',
        ausstehend: [
          {
            zeile: 1,
            schrittTyp: 'kremation',
            vonOrt: 'Kühlr. Grafenbach',
            nachOrt: 'Innermanzing',
            terminAm: '15.07.2026',
            status: 'geplant',
          },
        ],
      },
    ];
    const base = buildWallCalendarEntries(sterbefaelle);
    expect(base.some((e) => e.arts.includes('ueberfuehrung_kremation'))).toBe(true);

    const merged = mergeTransferPlanIntoEntries(
      base,
      {
        a1: {
          id: 'a1',
          docId: 'doc-krem',
          plannedDayKey: '2026-07-15',
          plannedZeit: '09:30',
          vonOrt: 'Kühlr. Grafenbach',
          nachOrt: 'Innermanzing',
          schrittTyp: 'kremation',
        },
      },
      sterbefaelle
    );

    const kremEntries = merged.filter(
      (e) =>
        e.docId === 'doc-krem' &&
        (e.arts.includes('ueberfuehrung_kremation') || /krem/i.test(e.title))
    );
    expect(kremEntries).toHaveLength(1);
    expect(kremEntries[0]?.id).toBe('plan:a1');
    expect(kremEntries[0]?.badges).toContain('Geplant');
  });

  it('fasst kombinierte Kremationen zu einer Kalenderkarte zusammen', () => {
    const sterbefaelle = [
      {
        id: 'k1',
        sterbefallId: '1',
        verstorbenerName: 'Alpha',
      },
      {
        id: 'k2',
        sterbefallId: '2',
        verstorbenerName: 'Beta',
      },
    ];
    const merged = mergeTransferPlanIntoEntries(
      [],
      {
        a: {
          id: 'a',
          docId: 'k1',
          plannedDayKey: '2026-07-30',
          plannedZeit: '09:00',
          vonOrt: 'Grafenbach',
          nachOrt: 'Innermanzing',
          schrittTyp: 'kremation',
          kremationGroupId: 'g1',
        },
        b: {
          id: 'b',
          docId: 'k2',
          plannedDayKey: '2026-07-30',
          plannedZeit: '09:00',
          vonOrt: 'Grafenbach',
          nachOrt: 'Innermanzing',
          schrittTyp: 'kremation',
          kremationGroupId: 'g1',
        },
      },
      sterbefaelle
    );
    const groups = merged.filter((e) => e.kremationGroupId === 'g1');
    expect(groups).toHaveLength(1);
    expect(groups[0]?.kremationMemberNames).toEqual(['Alpha', 'Beta']);
    expect(groups[0]?.badges).toContain('2×');
    expect(merged.filter((e) => e.arts.includes('ueberfuehrung_kremation'))).toHaveLength(1);
  });
});

describe('Schantl Begräbnis-Überführung', () => {
  it('hängt KR→Friedhof an Trauerfeier/Beisetzung auch nach Abschluss', () => {
    const entries = buildWallCalendarEntries([
      {
        id: '260166',
        sterbefallId: '260166',
        verstorbenerName: 'Günter Schantl',
        endziel: 'Ternitz - Stadtfriedhof',
        beisetzungsdatum: '28.07.2026',
        trauerfeierdatum: '28.07.2026',
        trauerfeierzeit: '14:30',
        trauerfeierort: 'Ternitz - Stadtfriedhof',
        imAnschluss: true,
        inHistory: true,
        aktivInDisposition: false,
        historieGrund: 'trauerfeier_im_anschluss',
        ausstehend: [
          {
            zeile: 3,
            schrittTyp: 'ueberfuehrung',
            vonOrt: 'Grafenbach',
            nachOrt: 'Ternitz',
            terminAm: '28.07.2026',
            status: 'heute',
            abholungAm: '28.07.2026',
          },
        ],
      },
    ]);

    expect(entries.length).toBeGreaterThanOrEqual(1);
    const host = entries.find((e) => e.docId === '260166');
    expect(host).toBeTruthy();
    expect(host?.attachedTransfer).toBe(true);
    expect(host?.arts).toContain('ueberfuehrung');
    expect(host?.badges.some((b) => /Überf|Grafenbach|Ternitz/i.test(b))).toBe(true);
  });
});
