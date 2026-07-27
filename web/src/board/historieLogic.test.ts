import { describe, expect, it } from 'vitest';
import {
  filterAktiveSterbefaelle,
  filterSterbefaelleFuerKalender,
  istFehlerhafterPlatzhalterFall,
  istInHistory,
} from './historieLogic';
import type { Sterbefall } from '../types';

describe('istFehlerhafterPlatzhalterFall', () => {
  it('erkennt „Nachname Verstorbener“', () => {
    expect(
      istFehlerhafterPlatzhalterFall({
        id: '1',
        verstorbenerName: 'Nachname Verstorbener',
      })
    ).toBe(true);
    expect(
      istFehlerhafterPlatzhalterFall({
        id: '2',
        verstorbenerName: '  nachname   verstorbener ',
      })
    ).toBe(true);
    expect(
      istFehlerhafterPlatzhalterFall({
        id: '3',
        verstorbenerVorname: 'Verstorbener',
        verstorbenerNachname: 'Nachname',
      })
    ).toBe(true);
  });

  it('lässt echte Namen durch', () => {
    expect(
      istFehlerhafterPlatzhalterFall({
        id: '4',
        verstorbenerName: 'Meier Anna',
      })
    ).toBe(false);
  });

  it('filtert aktive Disposition und Kalender', () => {
    const bad: Sterbefall = {
      id: 'bad',
      verstorbenerName: 'Nachname Verstorbener',
      trauerfeierdatum: '01.08.2026',
    };
    const good: Sterbefall = {
      id: 'good',
      verstorbenerName: 'Huber Franz',
    };

    expect(istInHistory(bad)).toBe(true);
    expect(filterAktiveSterbefaelle([bad, good])).toEqual([good]);
    expect(filterSterbefaelleFuerKalender([bad, good])).toEqual([good]);
  });
});
