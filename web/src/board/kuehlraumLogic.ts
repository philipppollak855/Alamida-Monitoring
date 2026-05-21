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

/** Noch am Sterbeort oder in einem Krankenhaus (nicht im Firmenkühlraum). */
export function isAmKrankenhausOderSterbeort(s: Sterbefall): boolean {
  if (s.aktuellePositionTyp === 'sterbeort') return true;

  const pos = s.aktuellePosition?.trim();
  if (pos && istKrankenhaus(pos)) return true;

  if (istKrankenhaus(s.sterbeort) || istKrankenhaus(s.abholort) || s.abholortIstKrankenhaus) {
    return true;
  }

  return (s.ausstehend ?? []).some(
    (a) =>
      a.istAbholungVomSterbeort ||
      a.status === 'abholung_noetig' ||
      (a.schrittTyp === 'abholung' &&
        (a.status === 'heute' || a.status === 'geplant') &&
        a.vonOrt &&
        istKrankenhaus(a.vonOrt))
  );
}

/**
 * Physisch im Firmenkühlraum — nicht nur vorgebuchter Platz, solange der Verstorbene
 * noch am KH/Sterbeort liegt.
 */
export function isImEigenenKuehlraum(s: Sterbefall): boolean {
  if (isAmKrankenhausOderSterbeort(s)) return false;

  const pos = s.aktuellePosition?.trim() ?? '';
  if (pos && (positionIstImKuehlraum(pos) || matchEigenerKuehlraum(pos))) return true;

  if (s.kuehlplatz?.trim() && matchEigenerKuehlraum(s.kuehlraumId)) return true;

  return false;
}
