import type { Sterbefall } from '../types';
import { getEffectiveAusstehend, schrittZielIstEigeneKr } from './ausstehendEffective';
import { isAusstehendHeuteOrGeplant } from './ausstehendStatus';
import { matchEigenerKuehlraum } from '../settings/ortMatchers';
import { parseDatumDe } from './dateUtils';
import { istKrankenhaus, istKrematorium } from './ortKeywords';
import { istAktuellImKrematorium, letzteAbgeschlosseneEtappe } from './positionLogic';
import { istInHistory } from './historieLogic';

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
  if (istAktuellImKrematorium(s)) return false;

  return getEffectiveAusstehend(s).some((a) => {
    if (!schrittZielIstEigeneKr(a)) return false;
    const termin = a.terminAm ?? a.abholungAm;
    if (!termin?.trim()) return true;
    return parseDatumDe(termin) > startOfTodayMs();
  });
}

function positionIstImKuehlraum(pos?: string): boolean {
  if (!pos?.trim()) return false;
  return !!matchEigenerKuehlraum(pos) || /kühlr|kuehlr/i.test(pos);
}

function letzteEtappeIstImEigenenKuehlraum(s: Sterbefall): boolean {
  const letzte = letzteAbgeschlosseneEtappe(s);
  if (!letzte) return false;

  if (letzte.typ === 'kremation') return false;

  const ort = letzte.nachOrt ?? letzte.ort;
  if (ort && istKrematorium(ort)) return false;

  return (
    zielIstEigenerKuehlraum(letzte.nachOrt) ||
    positionIstImKuehlraum(ort) ||
    !!matchEigenerKuehlraum(ort)
  );
}

/**
 * Überführung ins eigene Kühlraum abgeschlossen und Verstorbener noch nicht weiter (Kremation/Beisetzung).
 */
export function hatAbgeschlosseneUeberfuehrungInsEigeneKr(s: Sterbefall): boolean {
  if (istInHistory(s) || istAktuellImKrematorium(s)) return false;

  if (letzteEtappeIstImEigenenKuehlraum(s)) return true;

  const pos = s.aktuellePosition?.trim() ?? '';
  if (pos && (positionIstImKuehlraum(pos) || matchEigenerKuehlraum(pos))) return true;

  if (
    s.status === 'im_kuehlraum' &&
    s.kuehlplatz?.trim() &&
    matchEigenerKuehlraum(s.kuehlraumId) &&
    s.aktuellePositionTyp !== 'sterbeort' &&
    s.aktuellePositionTyp !== 'kremation'
  ) {
    return true;
  }

  if (s.kuehlplatz?.trim() && matchEigenerKuehlraum(s.kuehlraumId)) {
    if (s.aktuellePositionTyp === 'sterbeort' || s.aktuellePositionTyp === 'kremation') return false;
    if (pos && istKrankenhaus(pos)) return false;
    if (!letzteAbgeschlosseneEtappe(s)) return true;
  }

  return false;
}

/** Aktuell am Sterbeort oder KH — nicht nach erfolgter Weiterführung (KR/Kremation). */
export function isAmKrankenhausOderSterbeort(s: Sterbefall): boolean {
  if (istInHistory(s) || hatAbgeschlosseneUeberfuehrungInsEigeneKr(s) || istAktuellImKrematorium(s)) {
    return false;
  }

  const pos = s.aktuellePosition?.trim();
  if (pos) {
    if (positionIstImKuehlraum(pos) || matchEigenerKuehlraum(pos)) return false;
    if (istKrankenhaus(pos)) return true;
    return false;
  }

  if (s.aktuellePositionTyp === 'sterbeort') return true;

  if (hatAusstehendeUeberfuehrungInsEigeneKr(s)) return true;

  const hatOffeneKhAbholung = getEffectiveAusstehend(s).some(
    (a) =>
      a.istAbholungVomSterbeort ||
      a.status === 'abholung_noetig' ||
      (a.schrittTyp === 'abholung' &&
        isAusstehendHeuteOrGeplant(a) &&
        a.vonOrt &&
        istKrankenhaus(a.vonOrt))
  );
  if (hatOffeneKhAbholung) return true;

  if (
    s.kuehlplatz?.trim() &&
    matchEigenerKuehlraum(s.kuehlraumId) &&
    s.aktuellePositionTyp !== 'sterbeort'
  ) {
    return false;
  }

  if (
    s.abholortIstKrankenhaus ||
    istKrankenhaus(s.abholort)
  ) {
    return true;
  }

  return false;
}

/** Physisch im Firmenkühlraum (z. B. Grafenbach) — nicht in Kremation oder nach Beisetzung. */
export function isImEigenenKuehlraum(s: Sterbefall): boolean {
  if (istInHistory(s) || istAktuellImKrematorium(s)) return false;

  return hatAbgeschlosseneUeberfuehrungInsEigeneKr(s);
}
