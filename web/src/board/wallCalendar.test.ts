import { describe, it, expect } from 'vitest';
import {
  buildMonthOverviewGrid,
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

describe('summarizeWallCalendarDay', () => {
  it('zählt Termine und Überführungen getrennt', () => {
    const summary = summarizeWallCalendarDay([
      entry(['trauerfeier']),
      entry(['ueberfuehrung']),
      entry(['ueberfuehrung_kremation']),
    ]);
    expect(summary).toEqual({ total: 3, ueberfuehrungen: 2 });
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
