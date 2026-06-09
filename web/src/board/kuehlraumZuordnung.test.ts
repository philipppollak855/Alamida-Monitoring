import { describe, expect, it } from 'vitest';
import type { DispositionSettings } from '../types/dispositionSettings';
import { matchExternOrtZuKuehlraum, resolveFallKuehlraumId } from './kuehlraumZuordnung';
import type { Sterbefall } from '../types';

const settings: DispositionSettings = {
  kremationPrefixe: [],
  kremationKeywords: [],
  krankenhausPrefixe: ['UK '],
  krankenhausKeywords: ['krankenhaus'],
  pflegeheimPrefixe: [],
  pflegeheimKeywords: ['senecura'],
  bestattungPrefixe: [],
  bestattungKeywords: [],
  eigeneKuehlraeume: [
    {
      id: 'gb',
      label: 'Grafenbach',
      matchKeywords: ['grafenbach'],
      externKeywords: ['neunkirchen', 'uk-neunkirchen'],
      plaetze: 9,
    },
    {
      id: 'wien',
      label: 'Wien',
      matchKeywords: ['wien'],
      externKeywords: ['wolfsberg', 'uk wolfsberg'],
      plaetze: 6,
    },
  ],
};

describe('matchExternOrtZuKuehlraum', () => {
  it('ordnet UK-Neunkirchen Grafenbach zu', () => {
    expect(matchExternOrtZuKuehlraum('UK-Neunkirchen', settings)?.id).toBe('gb');
  });

  it('ordnet Wolfsberg Wien zu', () => {
    expect(matchExternOrtZuKuehlraum('KH Wolfsberg', settings)?.id).toBe('wien');
  });
});

describe('resolveFallKuehlraumId', () => {
  it('nutzt externKeywords bei ausstehender Route', () => {
    const fall = {
      id: '1',
      sterbefallId: '1',
      ausstehend: [
        {
          vonOrt: 'UK-Neunkirchen',
          nachOrt: 'Kühlr. Wien',
          status: 'geplant',
        },
      ],
    } as Sterbefall;
    expect(resolveFallKuehlraumId(fall, settings)).toBe('gb');
  });
});
