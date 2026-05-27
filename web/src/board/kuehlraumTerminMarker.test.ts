import { describe, it, expect } from 'vitest';
import { buildKuehlraumTerminMarkers } from './kuehlraumTerminMarker';
import type { Sterbefall } from '../types';

const now = new Date(2026, 4, 27);

function fall(overrides: Partial<Sterbefall>): Sterbefall {
  return { id: 'x', ...overrides };
}

describe('buildKuehlraumTerminMarkers', () => {
  it('zeigt Trauerfeier, Kremation und Beisetzung parallel', () => {
    const markers = buildKuehlraumTerminMarkers(
      fall({
        trauerfeierdatum: '08.06.2026',
        beisetzungsdatum: '08.06.2026',
        endzielTyp: 'kremation',
        ausstehend: [
          {
            schrittTyp: 'kremation',
            vonOrt: 'Kühl. Grafenbach',
            nachOrt: 'Innermanzing',
            status: 'geplant',
          },
        ],
      }),
      now
    );

    const kinds = markers.map((m) => m.kind);
    expect(kinds).toContain('trauerfeier');
    expect(kinds).toContain('kremation');
    expect(kinds).toContain('beisetzung');
  });

  it('zeigt Beisetzung im Anschluss ohne eigenes Datum', () => {
    const markers = buildKuehlraumTerminMarkers(
      fall({
        trauerfeierdatum: '08.06.2026',
        imAnschluss: true,
      }),
      now
    );

    expect(markers.some((m) => m.label.includes('im Anschluss'))).toBe(true);
  });

  it('parst Alamida-Datumstext mit Wochentag', () => {
    const markers = buildKuehlraumTerminMarkers(
      fall({
        trauerfeierdatum: 'Montag, 08.06.2026',
        beisetzungsdatum: 'Montag, 08.06.2026',
        endzielTyp: 'kremation',
      }),
      now
    );

    expect(markers.some((m) => m.kind === 'trauerfeier')).toBe(true);
    expect(markers.some((m) => m.kind === 'beisetzung')).toBe(true);
  });
});
