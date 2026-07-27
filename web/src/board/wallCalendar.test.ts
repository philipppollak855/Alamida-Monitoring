import { describe, it, expect } from 'vitest';
import { currentWeekDayRange } from './monthScrollWindow';
import {
  attachTransfersToCeremonyEntries,
  buildMonthOverviewGrid,
  buildWallCalendarDaysInRange,
  buildWallCalendarEntries,
  calendarColorGroupFromArts,
  filterEntriesInDayRange,
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
