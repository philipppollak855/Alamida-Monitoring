import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { Sterbefall } from '../types';
import { setDispositionSettings } from '../settings/dispositionSettingsStore';
import { DEFAULT_DISPOSITION_SETTINGS } from '../config/defaultDispositionSettings';
import { buildAlleEigeneKuehlraumSlots } from './boardUtils';
import { isImEigenenKuehlraum } from './kuehlraumLogic';
import { resolveFallKuehlraumId } from './kuehlraumZuordnung';

function kerschhoferFall(mitWeitererUeberfuehrung: boolean): Sterbefall {
  const ausstehend = [
    {
      zeile: 1,
      schrittTyp: 'abholung' as const,
      vonOrt: 'UK - Neunkirchen',
      nachOrt: 'Kühl. Grafenbach',
      terminAm: '05.06.2026',
      status: 'geplant',
    },
    ...(mitWeitererUeberfuehrung
      ? [
          {
            zeile: 2,
            schrittTyp: 'ueberfuehrung' as const,
            vonOrt: 'Grafenbach',
            nachOrt: 'Schwarzau am Steinfeld',
            terminAm: '11.06.2026',
            status: 'geplant',
          },
        ]
      : []),
  ];

  return {
    id: 'k1',
    sterbefallId: '260200',
    verstorbenerName: 'Kerschhofer',
    aktivInAlamida: true,
    aktuellePosition: 'UK - Neunkirchen',
    aktuellePositionTyp: 'sterbeort',
    abholort: 'UK - Neunkirchen / Kühl. Grafenbach',
    abholortIstKrankenhaus: true,
    naechsterSchrittVon: mitWeitererUeberfuehrung ? 'Grafenbach' : 'UK - Neunkirchen',
    naechsterSchrittNach: mitWeitererUeberfuehrung ? 'Schwarzau am Steinfeld' : 'Kühl. Grafenbach',
    naechsterSchrittAm: mitWeitererUeberfuehrung ? '11.06.2026' : '05.06.2026',
    naechsterSchrittTyp: 'ueberfuehrung',
    ausstehend,
  };
}

describe('isImEigenenKuehlraum', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 9, 12, 0, 0));
    setDispositionSettings(DEFAULT_DISPOSITION_SETTINGS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('erkennt UK→Kühl. Grafenbach mit vergangenem Termin trotz KH-Position', () => {
    expect(isImEigenenKuehlraum(kerschhoferFall(false))).toBe(true);
  });

  it('bleibt im Kühlraum Grafenbach trotz geplanter Weiterführung nach Schwarzau', () => {
    const fall = kerschhoferFall(true);
    expect(isImEigenenKuehlraum(fall)).toBe(true);
    expect(resolveFallKuehlraumId(fall)).toBe('grafenbach');

    const grids = buildAlleEigeneKuehlraumSlots(
      [fall],
      DEFAULT_DISPOSITION_SETTINGS.eigeneKuehlraeume
    );
    const grafenbach = grids.find((g) => g.cfg.id === 'grafenbach');
    expect(grafenbach?.slots.some((s) => s?.verstorbenerName === 'Kerschhofer')).toBe(true);
  });

  it('bucht aus dem Kühlraum aus, sobald die Weiterführung fällig ist', () => {
    vi.setSystemTime(new Date(2026, 5, 11, 12, 0, 0));
    const fall = kerschhoferFall(true);
    expect(isImEigenenKuehlraum(fall)).toBe(false);
  });

  it('bucht Schantl-ähnlich aus, wenn Überführung heute und Position schon extern', () => {
    vi.setSystemTime(new Date(2026, 6, 28, 13, 0, 0));
    const schantl: Sterbefall = {
      id: 'schantl',
      verstorbenerName: 'Günter Schantl',
      aktivInAlamida: true,
      aktuellePosition: 'UK - Neunkirchen',
      aktuellePositionTyp: 'sterbeort',
      kuehlraumId: 'Kühlr. Grafenbach',
      kuehlplatz: '3',
      status: 'im_kuehlraum',
      ausstehend: [
        {
          zeile: 1,
          schrittTyp: 'ueberfuehrung',
          vonOrt: 'Kühl. Grafenbach',
          nachOrt: 'UK - Neunkirchen',
          terminAm: '28.07.2026',
          status: 'heute',
        },
      ],
      verlauf: [
        {
          typ: 'abholung',
          vonOrt: 'UK - Wiener Neustadt',
          nachOrt: 'Kühl. Grafenbach',
          ort: 'Kühl. Grafenbach',
        },
        {
          typ: 'ueberfuehrung',
          vonOrt: 'Kühl. Grafenbach',
          nachOrt: 'UK - Neunkirchen',
          ort: 'UK - Neunkirchen',
        },
      ],
    };
    expect(isImEigenenKuehlraum(schantl)).toBe(false);
  });

  it('hält Fall bis Feier − 1h im Kühlraum trotz vorzeitiger Alamida-Ausbuchung', () => {
    vi.setSystemTime(new Date(2026, 6, 28, 8, 0, 0));
    const berger: Sterbefall = {
      id: '260153',
      verstorbenerName: 'Friedrich Berger',
      inHistory: true,
      aktivInDisposition: false,
      aktuellePosition: 'Gloggnitz',
      aktuellePositionTyp: 'ueberfuehrung',
      imAnschluss: true,
      trauerfeierdatum: '28.07.2026',
      trauerfeierzeit: '11:00',
      beisetzungsdatum: '28.07.2026',
      ausstehend: [
        {
          zeile: 1,
          schrittTyp: 'ueberfuehrung',
          vonOrt: 'Grafenbach',
          nachOrt: 'Gloggnitz',
          terminAm: '28.07.2026',
          status: 'heute',
        },
      ],
      verlauf: [
        {
          typ: 'abholung',
          vonOrt: 'UK - Neunkirchen',
          nachOrt: 'Kühl. Grafenbach',
          ort: 'Kühl. Grafenbach',
        },
        {
          typ: 'ueberfuehrung',
          vonOrt: 'Grafenbach',
          nachOrt: 'Gloggnitz',
          ort: 'Gloggnitz',
        },
      ],
    };
    expect(isImEigenenKuehlraum(berger)).toBe(true);
    expect(resolveFallKuehlraumId(berger)).toBe('grafenbach');

    vi.setSystemTime(new Date(2026, 6, 28, 10, 0, 0));
    expect(isImEigenenKuehlraum(berger)).toBe(false);
  });
});
