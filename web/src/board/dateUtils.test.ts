import { describe, it, expect } from 'vitest';
import { extractDeDatum, startOfWeekMonday, dayKeyFromDate } from './dateUtils';
import { buildWallCalendarDays, filterCalendarEntries } from './wallCalendar';

describe('extractDeDatum', () => {
  it('extrahiert Datum aus Text mit Wochentag und Uhrzeit', () => {
    expect(extractDeDatum('Montag, 08.06.2026 13:00')).toBe('08.06.2026');
  });

  it('normalisiert einstellige Tage/Monate', () => {
    expect(extractDeDatum('8.6.2026')).toBe('08.06.2026');
  });
});

describe('startOfWeekMonday', () => {
  it('liefert Montag derselben Woche', () => {
    const wed = new Date(2026, 4, 27);
    expect(dayKeyFromDate(startOfWeekMonday(wed))).toBe('2026-05-25');
  });
});

describe('buildWallCalendarDays Wochenraster', () => {
  const anchor = new Date(2026, 4, 27);

  it('7 Tage: Montag bis Sonntag', () => {
    const days = buildWallCalendarDays([], 7, anchor);
    expect(days).toHaveLength(7);
    expect(days[0]?.dayKey).toBe('2026-05-25');
    expect(days[6]?.dayKey).toBe('2026-05-31');
    expect(days[0]?.weekdayShort.toLowerCase()).toMatch(/^mo/);
    expect(days[6]?.weekdayShort.toLowerCase()).toMatch(/^so/);
  });

  it('14 Tage: zwei volle Wochen Mo–So', () => {
    const days = buildWallCalendarDays([], 14, anchor);
    expect(days).toHaveLength(14);
    expect(days[0]?.dayKey).toBe('2026-05-25');
    expect(days[7]?.dayKey).toBe('2026-06-01');
    expect(days[13]?.dayKey).toBe('2026-06-07');
  });

  it('filterCalendarEntries folgt dem Wochenraster', () => {
    const entries = filterCalendarEntries(
      [
        {
          id: 'a',
          docId: 'a',
          sterbefallId: '1',
          dayKey: '2026-05-24',
          dayLabel: '',
          timeLabel: '',
          sortMs: 0,
          name: 'Alt',
          title: '',
          subtitle: '',
          badges: [],
          grouped: false,
          arts: ['beisetzung'],
          searchText: '',
        },
        {
          id: 'b',
          docId: 'b',
          sterbefallId: '2',
          dayKey: '2026-05-26',
          dayLabel: '',
          timeLabel: '',
          sortMs: 0,
          name: 'In Woche',
          title: '',
          subtitle: '',
          badges: [],
          grouped: false,
          arts: ['beisetzung'],
          searchText: '',
        },
      ],
      7,
      anchor,
      ''
    );
    expect(entries.map((e) => e.dayKey)).toEqual(['2026-05-26']);
  });
});
