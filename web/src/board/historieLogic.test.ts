import { describe, expect, it } from 'vitest';
import {
  filterAktiveSterbefaelle,
  filterSterbefaelleFuerKalender,
  istFehlerhafterPlatzhalterFall,
  istInHistory,
  istNachBeisetzungOderTrauerfeierAbgelaufenCeremony,
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

describe('sichtbarBis / vorzeitiges Archiv', () => {
  it('blendet Im-Anschluss-Fall nicht aus, wenn sichtbarBis auf Tagesbeginn steht', () => {
    // sichtbarBis = 28.07.2026 00:00 UTC, Trauerfeier erst 11:00
    const s: Sterbefall = {
      id: '260153',
      verstorbenerName: 'Friedrich Berger',
      imAnschluss: true,
      trauerfeierdatum: '28.07.2026',
      trauerfeierzeit: '11:00',
      beisetzungsdatum: '28.07.2026',
      beisetzungszeit: '',
      inHistory: false,
      aktivInDisposition: true,
      sichtbarBis: { seconds: 1785196800 },
    };
    const vormittag = new Date(2026, 6, 28, 7, 30).getTime();
    expect(istNachBeisetzungOderTrauerfeierAbgelaufenCeremony(s, vormittag)).toBe(false);
    // Patch Date.now via ceremony+sichtbarBis through istInHistory path
    const real = Date.now;
    Date.now = () => vormittag;
    try {
      expect(istInHistory(s)).toBe(false);
    } finally {
      Date.now = real;
    }
  });

  it('zeigt Agent-Archiv mit Feiertermin am selben Tag weiterhin aktiv', () => {
    const s: Sterbefall = {
      id: '260166',
      verstorbenerName: 'Günter Schantl',
      imAnschluss: true,
      trauerfeierdatum: '28.07.2026',
      trauerfeierzeit: '14:30',
      beisetzungsdatum: '28.07.2026',
      inHistory: true,
      aktivInDisposition: true,
      historieGrund: 'trauerfeier_im_anschluss',
      sichtbarBis: { seconds: 1785196800 },
    };
    const real = Date.now;
    Date.now = () => new Date(2026, 6, 28, 7, 30).getTime();
    try {
      expect(istInHistory(s)).toBe(false);
    } finally {
      Date.now = real;
    }
  });

  it('blendet nach Trauerfeier+2h aus', () => {
    const s: Sterbefall = {
      id: '260153',
      verstorbenerName: 'Friedrich Berger',
      imAnschluss: true,
      trauerfeierdatum: '28.07.2026',
      trauerfeierzeit: '11:00',
      beisetzungsdatum: '28.07.2026',
      inHistory: true,
      historieGrund: 'trauerfeier_im_anschluss',
    };
    const real = Date.now;
    Date.now = () => new Date(2026, 6, 28, 13, 5).getTime();
    try {
      expect(istInHistory(s)).toBe(true);
    } finally {
      Date.now = real;
    }
  });
});
