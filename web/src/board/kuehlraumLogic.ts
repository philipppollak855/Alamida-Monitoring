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

/** Physisch im Firmenkühlraum — nicht nur in Alamida vorgebucht. */
export function isImEigenenKuehlraum(s: Sterbefall): boolean {
  if (s.status !== 'im_kuehlraum') return false;
  const pos = s.aktuellePosition?.trim() ?? '';
  if (pos && !positionIstImKuehlraum(pos)) return false;
  if (!matchEigenerKuehlraum(s.kuehlraumId) && !positionIstImKuehlraum(pos)) return false;
  if (s.aktuellePositionTyp === 'sterbeort') return false;
  const khOrt = s.sterbeort || s.abholort;
  if (
    (istKrankenhaus(khOrt) || s.abholortIstKrankenhaus) &&
    hatAusstehendeUeberfuehrungInsEigeneKr(s)
  ) {
    return false;
  }
  return true;
}
