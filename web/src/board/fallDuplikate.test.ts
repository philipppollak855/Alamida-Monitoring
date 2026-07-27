import { describe, expect, it } from 'vitest';
import {
  countEmpfohleneDuplikatEntfernungen,
  fallNameMatchKey,
  findFallDuplikatGruppen,
  isNeuDokumentId,
  normalizeNameKey,
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

  it('erkennt Vor- und Nachname in umgekehrter Reihenfolge', () => {
    expect(normalizeNameKey('Anna Meier')).toBe(normalizeNameKey('Meier Anna'));
    expect(normalizeNameKey('Meier, Anna')).toBe(normalizeNameKey('Anna Meier'));

    const groups = findFallDuplikatGruppen([
      fall({
        id: 'NEU-BBB',
        verstorbenerName: 'Meier Anna',
        sterbedatum: '12.04.2026',
      }),
      fall({
        id: '260300',
        sterbefallId: '260300',
        verstorbenerVorname: 'Anna',
        verstorbenerNachname: 'Meier',
        sterbedatum: '12.04.2026',
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.keepId).toBe('260300');
    expect(groups[0]!.removeIds).toEqual(['NEU-BBB']);
    expect(fallNameMatchKey(groups[0]!.faelle[0]!)).toBe(
      fallNameMatchKey(groups[0]!.faelle[1]!)
    );
  });

  it('ignoriert Platzhalter-Namen', () => {
    const groups = findFallDuplikatGruppen([
      fall({ id: 'a', verstorbenerName: 'Nachname Verstorbener' }),
      fall({ id: 'b', verstorbenerName: 'Nachname Verstorbener' }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it('ignoriert bereits entfernte Duplikate', () => {
    const groups = findFallDuplikatGruppen([
      fall({
        id: 'keep',
        sterbefallId: '260400',
        verstorbenerName: 'Same Name',
        sterbedatum: '01.05.2026',
      }),
      fall({
        id: 'gone',
        verstorbenerName: 'Same Name',
        sterbedatum: '01.05.2026',
        inHistory: true,
        aktivInDisposition: false,
        historieGrund: 'duplikat_bereinigt',
      }),
    ]);
    expect(groups).toHaveLength(0);
  });
});
