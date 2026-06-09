import { describe, expect, it } from 'vitest';
import { buildBoardSearchHits } from './boardGlobalSearch';
import type { Sterbefall } from '../types';

describe('buildBoardSearchHits', () => {
  it('findet Kühlraum und Überführung', () => {
    const sterbefaelle: Sterbefall[] = [
      {
        id: '1',
        verstorbenerName: 'Franz Kerschhofer',
        sterbefallId: '260200',
        status: 'im_kuehlraum',
        kuehlplatz: '2',
        kuehlraumId: 'Kühlr. Grafenbach',
      },
    ];
    const grids = [
      {
        cfg: { id: 'gb', label: 'Grafenbach', matchKeywords: [], plaetze: 9 },
        slots: [null, sterbefaelle[0], null] as (Sterbefall | null)[],
      },
    ];
    const hits = buildBoardSearchHits('kersch', sterbefaelle, [], [], grids);
    expect(hits.some((h) => h.kind === 'kuehlraum')).toBe(true);
  });
});
