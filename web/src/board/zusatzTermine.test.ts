import { describe, expect, it } from 'vitest';
import {
  calendarColorGroupFromArts,
  mergeZusatzTermineIntoEntries,
  zusatzTerminToEntry,
} from './wallCalendar';

describe('zusatzTermine im Kalender', () => {
  it('baut Graben-Eintrag für Fall', () => {
    const entry = zusatzTerminToEntry({
      id: 'z1',
      docId: 'doc-1',
      sterbefallId: '260100',
      name: 'Meier Anna',
      art: 'graben',
      title: 'Graben für Begräbnis',
      dayKey: '2026-07-30',
      zeit: '08:00',
      ort: 'Friedhof',
    });
    expect(entry).not.toBeNull();
    expect(entry!.zusatzTerminId).toBe('z1');
    expect(entry!.arts).toEqual(['graben']);
    expect(entry!.title).toBe('Graben für Begräbnis');
    expect(entry!.timeLabel).toBe('08:00');
    expect(entry!.name).toBe('Meier Anna');
    expect(calendarColorGroupFromArts(entry!.arts)).toBe('zusatz');
  });

  it('merged Zusatztermine in bestehende Liste', () => {
    const merged = mergeZusatzTermineIntoEntries(
      [
        {
          id: 'a',
          docId: 'd',
          sterbefallId: '1',
          dayKey: '2026-07-30',
          dayLabel: 'Do., 30.07.2026',
          timeLabel: '10:00',
          sortMs: 1,
          name: 'X',
          title: 'Trauerfeier',
          subtitle: '',
          badges: ['Trauerfeier'],
          grouped: false,
          arts: ['trauerfeier'],
          searchText: 'x',
        },
      ],
      [
        {
          id: 'z2',
          docId: 'd2',
          sterbefallId: '2',
          name: 'Huber',
          art: 'sonstiges',
          title: 'Sonstiger Termin',
          dayKey: '2026-07-30',
          zeit: '07:00',
        },
      ]
    );
    expect(merged).toHaveLength(2);
    const zusatz = merged.find((e) => e.zusatzTerminId === 'z2');
    expect(zusatz?.title).toBe('Sonstiger Termin');
    expect(zusatz?.arts).toEqual(['sonstiges']);
  });

  it('erlaubt Sonstiges ohne Fall', () => {
    const entry = zusatzTerminToEntry({
      id: 'z-free',
      docId: '',
      sterbefallId: '',
      name: '',
      art: 'sonstiges',
      title: 'Material holen',
      dayKey: '2026-07-30',
      zeit: '09:00',
    });
    expect(entry).not.toBeNull();
    expect(entry!.name).toBe('Material holen');
    expect(entry!.title).toBe('Material holen');
    expect(entry!.arts).toEqual(['sonstiges']);
    expect(entry!.zusatzTerminId).toBe('z-free');
  });
});
