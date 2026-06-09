import { describe, expect, it, beforeEach } from 'vitest';
import type { Sterbefall } from '../types';
import { setDispositionSettings } from '../settings/dispositionSettingsStore';
import { DEFAULT_DISPOSITION_SETTINGS } from '../config/defaultDispositionSettings';
import { isImEigenenKuehlraum } from './kuehlraumLogic';

describe('isImEigenenKuehlraum', () => {
  beforeEach(() => {
    setDispositionSettings(DEFAULT_DISPOSITION_SETTINGS);
  });

  it('erkennt UK→Kühl. Grafenbach mit vergangenem Termin trotz KH-Position', () => {
    const fall: Sterbefall = {
      id: 'k1',
      sterbefallId: '260200',
      verstorbenerName: 'Kerschhofer',
      aktivInAlamida: true,
      aktuellePosition: 'UK - Neunkirchen',
      aktuellePositionTyp: 'sterbeort',
      abholort: 'UK - Neunkirchen / Kühl. Grafenbach',
      abholortIstKrankenhaus: true,
      naechsterSchrittVon: 'UK - Neunkirchen',
      naechsterSchrittNach: 'Kühl. Grafenbach',
      naechsterSchrittAm: '05.06.2026',
      naechsterSchrittTyp: 'ueberfuehrung',
      ausstehend: [
        {
          zeile: 1,
          schrittTyp: 'ueberfuehrung',
          vonOrt: 'UK - Neunkirchen / Kühl. Grafenbach',
          nachOrt: 'Kühl. Grafenbach',
          terminAm: '05.06.2026',
          status: 'geplant',
        },
      ],
    };

    expect(isImEigenenKuehlraum(fall)).toBe(true);
  });
});
