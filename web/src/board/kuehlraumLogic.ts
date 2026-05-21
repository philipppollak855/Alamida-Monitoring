import type { Sterbefall } from '../types';
import { matchEigenerKuehlraum } from '../settings/ortMatchers';
import { parseDatumDe } from './dateUtils';
import { istKrankenhaus } from './ortKeywords';

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Ziel ist ein konfigurierter Firmenkühlraum (z. B. Grafenbach). */
export function zielIstEigenerKuehlraum(nachOrt?: string): boolean {
  if (!nachOrt?.trim()) return false;
  return !!matchEigenerKuehlraum(nachOrt);
}

/**
 * Überführung ins eigene KR ist vorgebucht, aber noch nicht erfolgt (kein / zukünftiges Datum).
 */
export function hatAusstehendeUeberfuehrungInsEigeneKr(s: Sterbefall): boolean {
  return (s.ausstehend ?? []).some((a) => {
    if (!zielIstEigenerKuehlraum(a.nachOrt)) return false;
    const termin = a.terminAm ?? a.abholungAm;
    if (!termin?.trim()) return true;
    return parseDatumDe(termin) > startOfTodayMs();
  });
}

function positionIstImKuehlraum(pos?: string): boolean {
  if (!pos?.trim()) return false;
  return !!matchEigenerKuehlraum(pos) || /kühlr|kuehlr/i.test(pos);
}

/**
 * Überführung ins eigene Kühlraum mit Datum heute oder früher (laut Verlauf/Position).
 */
export function hatAbgeschlosseneUeberfuehrungInsEigeneKr(s: Sterbefall): boolean {
  const heute = startOfTodayMs();
  const pos = s.aktuellePosition?.trim() ?? '';

  if (
    s.status === 'im_kuehlraum' &&
    s.kuehlplatz?.trim() &&
    matchEigenerKuehlraum(s.kuehlraumId) &&
    s.aktuellePositionTyp !== 'sterbeort'
  ) {
    return true;
  }

  if (pos && (positionIstImKuehlraum(pos) || matchEigenerKuehlraum(pos))) return true;

  for (const v of s.verlauf ?? []) {
    const ziel = v.nachOrt ?? v.ort;
    if (!zielIstEigenerKuehlraum(ziel) && !positionIstImKuehlraum(v.ort)) continue;
    const termin = v.terminAm ?? v.abholungAm;
    if (!termin?.trim()) continue;
    if (parseDatumDe(termin) <= heute) return true;
  }

  if (s.kuehlplatz?.trim() && matchEigenerKuehlraum(s.kuehlraumId)) {
    if (s.aktuellePositionTyp && s.aktuellePositionTyp !== 'sterbeort') return true;
    if (pos && !istKrankenhaus(pos)) return true;
  }

  return false;
}

/** Aktuell am Sterbeort oder KH — nicht historischer Sterbeort nach erfolgter Überführung. */
export function isAmKrankenhausOderSterbeort(s: Sterbefall): boolean {
  if (hatAbgeschlosseneUeberfuehrungInsEigeneKr(s)) return false;

  const pos = s.aktuellePosition?.trim();
  if (pos) {
    if (positionIstImKuehlraum(pos) || matchEigenerKuehlraum(pos)) return false;
    if (istKrankenhaus(pos)) return true;
    return false;
  }

  if (s.aktuellePositionTyp === 'sterbeort') return true;

  if (hatAusstehendeUeberfuehrungInsEigeneKr(s)) return true;

  const hatOffeneKhAbholung = (s.ausstehend ?? []).some(
    (a) =>
      a.istAbholungVomSterbeort ||
      a.status === 'abholung_noetig' ||
      (a.schrittTyp === 'abholung' &&
        (a.status === 'heute' || a.status === 'geplant') &&
        a.vonOrt &&
        istKrankenhaus(a.vonOrt))
  );
  if (hatOffeneKhAbholung) return true;

  // Noch keine aktuelle Position — historischer KH-Sterbeort, aber nicht bei vorgebuchtem KR-Platz
  if (
    s.kuehlplatz?.trim() &&
    matchEigenerKuehlraum(s.kuehlraumId) &&
    s.aktuellePositionTyp !== 'sterbeort'
  ) {
    return false;
  }

  if (
    s.abholortIstKrankenhaus ||
    istKrankenhaus(s.sterbeort) ||
    istKrankenhaus(s.abholort)
  ) {
    return true;
  }

  return false;
}

/** Physisch im Firmenkühlraum (z. B. Grafenbach). */
export function isImEigenenKuehlraum(s: Sterbefall): boolean {
  if (hatAbgeschlosseneUeberfuehrungInsEigeneKr(s)) return true;

  const pos = s.aktuellePosition?.trim() ?? '';
  if (pos && (positionIstImKuehlraum(pos) || matchEigenerKuehlraum(pos))) return true;

  if (s.kuehlplatz?.trim() && matchEigenerKuehlraum(s.kuehlraumId)) {
    if (pos && istKrankenhaus(pos)) return false;
    if (s.aktuellePositionTyp === 'sterbeort') return false;
    return true;
  }

  return false;
}
