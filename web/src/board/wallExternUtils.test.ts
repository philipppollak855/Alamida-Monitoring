import { describe, it, expect, beforeEach } from 'vitest';
import { buildExternGruppen } from './wallExternUtils';
import type { Sterbefall } from '../types';
import { setDispositionSettings } from '../settings/dispositionSettingsStore';
import { DEFAULT_DISPOSITION_SETTINGS } from '../config/defaultDispositionSettings';

function baseFall(overrides: Partial<Sterbefall>): Sterbefall {
  return {
    id: 'doc1',
    sterbefallId: 'test1',
    verstorbenerName: 'Test',
    aktivInAlamida: true,
    ...overrides,
  };
}

describe('buildExternGruppen', () => {
  beforeEach(() => {
    setDispositionSettings(DEFAULT_DISPOSITION_SETTINGS);
  });

  it('klassifiziert Bestattung Kunz → KR nicht als Krankenhaus', () => {
    const gruppen = buildExternGruppen([
      baseFall({
        id: 'b1',
        verstorbenerName: 'Michael Brauneder',
        abholort: 'Bestattung Kunz',
        abholortIstKrankenhaus: false,
        naechsterSchrittVon: 'Bestattung Kunz',
        naechsterSchrittNach: 'Kühlr. Grafenbach',
        naechsterSchrittTyp: 'abholung',
      }),
    ]);

    expect(gruppen.filter((g) => g.typ === 'krankenhaus')).toHaveLength(0);
    const bestattung = gruppen.find((g) => g.typ === 'bestattung');
    expect(bestattung?.ort).toMatch(/kunz/i);
    expect(bestattung?.faelle.some((f) => f.name.includes('Brauneder'))).toBe(true);
  });

  it('zeigt UK Wiener Neustadt → Kühl. unter Krankenhaus', () => {
    const gruppen = buildExternGruppen([
      baseFall({
        id: 't1',
        verstorbenerName: 'Touahria',
        sterbefallId: '260100',
        abholort: 'UK - Wiener Neustadt',
        abholortIstKrankenhaus: true,
        naechsterSchrittVon: 'UK - Wiener Neustadt',
        naechsterSchrittNach: 'Kühl. Grafenbach',
        naechsterSchrittTyp: 'abholung',
      }),
    ]);

    const kh = gruppen.find((g) => g.typ === 'krankenhaus');
    expect(kh).toBeDefined();
    expect(kh!.faelle.some((f) => f.name.includes('Touahria'))).toBe(true);
    expect(kh!.ort.toLowerCase()).toContain('neustadt');
  });

  it('erkennt UK-Route auch nur mit getrenntem abholort und naechsterSchrittNach', () => {
    const gruppen = buildExternGruppen([
      baseFall({
        id: 't2',
        verstorbenerName: 'Touahria',
        abholort: 'UK - Wiener Neustadt',
        abholortIstKrankenhaus: true,
        ausstehend: [],
        naechsterSchrittVon: 'UK - Wiener Neustadt',
        naechsterSchrittNach: 'Kühl. Grafenbach',
        naechsterSchrittTyp: 'abholung',
      }),
    ]);

    expect(gruppen.some((g) => g.typ === 'krankenhaus' && g.faelle.length > 0)).toBe(true);
  });
});
