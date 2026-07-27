import { describe, expect, it } from 'vitest';
import {
  countEmpfohleneDuplikatEntfernungen,
  findFallDuplikatGruppen,
  isNeuDokumentId,
  preferierterFall,
} from './fallDuplikate';
import type { Sterbefall } from '../types';

function fall(partial: Partial<Sterbefall> & { id: string }): Sterbefall {
  return {
    sterbefallId: partial.sterbefallId ?? partial.id,
    ...partial,
  };
}

describe('fallDuplikate', () => {
  it('erkennt NEU-Dokument-IDs', () => {
    expect(isNeuDokumentId('NEU-ABCDEF123456')).toBe(true);
    expect(isNeuDokumentId('260145')).toBe(false);
  });

  it('bevorzugt echte Sterbefall-ID gegenüber NEU', () => {
    const neu = fall({
      id: 'NEU-AAA111BBB222',
      verstorbenerName: 'Max Mustermann',
      sterbedatum: '01.01.2026',
    });
    const real = fall({
      id: '260145',
      sterbefallId: '260145',
      verstorbenerName: 'Max Mustermann',
      sterbedatum: '01.01.2026',
      verlauf: [{ nummer: 1, typ: 'abholung' }],
    });
    expect(preferierterFall([neu, real]).id).toBe('260145');
  });

  it('findet Duplikatgruppe gleicher Name + Datum', () => {
    const groups = findFallDuplikatGruppen([
      fall({
        id: 'NEU-AAA111BBB222',
        verstorbenerName: 'Erika Muster',
        sterbedatum: '10.03.2026',
      }),
      fall({
        id: '260200',
        sterbefallId: '260200',
        verstorbenerName: 'Erika Muster',
        sterbedatum: '10.03.2026',
      }),
      fall({
        id: '260201',
        sterbefallId: '260201',
        verstorbenerName: 'Anderer Name',
        sterbedatum: '10.03.2026',
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.keepId).toBe('260200');
    expect(groups[0]!.removeIds).toEqual(['NEU-AAA111BBB222']);
    expect(countEmpfohleneDuplikatEntfernungen(groups)).toBe(1);
  });

  it('ignoriert Platzhalter-Namen', () => {
    const groups = findFallDuplikatGruppen([
      fall({ id: 'a', verstorbenerName: 'Nachname Verstorbener' }),
      fall({ id: 'b', verstorbenerName: 'Nachname Verstorbener' }),
    ]);
    expect(groups).toHaveLength(0);
  });
});
