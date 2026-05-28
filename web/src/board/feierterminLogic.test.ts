import { describe, it, expect } from 'vitest';
import { calendarBestattungsMarker, hatKremationImSterbefall } from './feierterminLogic';
import { buildKuehlraumTerminMarkers } from './kuehlraumTerminMarker';
import { buildWallCalendarEntries } from './wallCalendar';
import type { Sterbefall } from '../types';

const base: Sterbefall = { id: '1', sterbefallId: '260001' };

describe('calendarBestattungsMarker', () => {
  it('S bei Trauerfeier ohne Kremation', () => {
    expect(
      calendarBestattungsMarker(
        { ...base, trauerfeierdatum: '08.06.2026' },
        ['trauerfeier'],
        'Trauerfeier'
      )
    ).toBe('S');
  });

  it('U bei Trauerfeier mit Kremation im Ablauf', () => {
    expect(
      calendarBestattungsMarker(
        {
          ...base,
          trauerfeierdatum: '08.06.2026',
          endzielTyp: 'kremation',
        },
        ['trauerfeier'],
        'Trauerfeier'
      )
    ).toBe('U');
  });

  it('U bei Beisetzung mit Kremation', () => {
    expect(
      calendarBestattungsMarker(
        {
          ...base,
          beisetzungsdatum: '09.06.2026',
          ausstehend: [{ schrittTyp: 'kremation', status: 'geplant' }],
        },
        ['beisetzung'],
        'Beisetzung'
      )
    ).toBe('U');
  });

  it('kein S nur für Rosenkranz', () => {
    expect(
      calendarBestattungsMarker(
        { ...base, rosenkranzdatum: '08.06.2026' },
        ['rosenkranz'],
        'Rosenkranz'
      )
    ).toBeUndefined();
  });
});

describe('integration S/U markers', () => {
  it('Kalender: ein Trauerfeier-Termin mit S', () => {
    const entries = buildWallCalendarEntries([
      {
        ...base,
        verstorbenerName: 'Test',
        trauerfeierdatum: '08.06.2026',
        beisetzungsdatum: '08.06.2026',
        beisetzungszeit: 'Im Anschluss',
      },
    ]);
    const feier = entries.find((e) => e.title === 'Trauerfeier');
    expect(feier?.bestattungsMarker).toBe('S');
    expect(hatKremationImSterbefall({ ...base, endzielTyp: 'kremation' })).toBe(true);
  });

  it('Kühlraum: Trauerfeier-Chip mit U bei Kremation', () => {
    const markers = buildKuehlraumTerminMarkers({
      ...base,
      trauerfeierdatum: '08.06.2026',
      endzielTyp: 'kremation',
    });
    const tf = markers.find((m) => m.kind === 'trauerfeier');
    expect(tf?.bestattungsMarker).toBe('U');
  });
});
