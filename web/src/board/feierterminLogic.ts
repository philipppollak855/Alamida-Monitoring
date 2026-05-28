import type { Sterbefall } from '../types';
import { isAusstehendHeuteOrGeplant } from './ausstehendStatus';
import { dayKeyFromDeDatum, extractDeDatum, extractZeitDe } from './dateUtils';
import { istImAnschluss, sterbefallImAnschluss } from './historieLogic';
import { istKrematorium } from './ortKeywords';

/** S = Sarg (ohne Kremation), U = Urne (mit Kremation im Ablauf). */
export type BestattungsMarker = 'S' | 'U';

function istOffenerKremationsschritt(a: {
  schrittTyp?: string;
  status?: string;
  terminAm?: string;
  abholungAm?: string;
}): boolean {
  if (a.schrittTyp !== 'kremation') return false;
  if (a.status === 'abholung_noetig') return true;
  return isAusstehendHeuteOrGeplant(a);
}

/** Kremation geplant, offen oder bereits im Verlauf (vor Feier/Beisetzung). */
export function hatKremationImSterbefall(s: Sterbefall): boolean {
  if ((s.ausstehend ?? []).some(istOffenerKremationsschritt)) return true;
  if ((s.verlauf ?? []).some((v) => (v.typ ?? '').toLowerCase() === 'kremation')) return true;
  if (s.naechsterSchrittTyp === 'kremation') return true;
  if (s.endzielTyp === 'kremation') return true;
  if (s.endziel?.trim() && istKrematorium(s.endziel)) return true;
  return false;
}

const FEIER_MARKER_ARTS = new Set([
  'trauerfeier',
  'verabschiedung',
  'trauerfeier2',
  'beisetzung',
  'rosenkranz',
]);

function entryHatTrauerfeierOderVerabschiedung(arts: readonly string[], title: string): boolean {
  if (title === 'Trauerfeier' || title === 'Verabschiedung' || title === 'Trauerfeier 2') return true;
  return arts.some((a) => a === 'trauerfeier' || a === 'verabschiedung' || a === 'trauerfeier2');
}

function entryHatBeisetzung(arts: readonly string[], title: string): boolean {
  return title === 'Beisetzung' || arts.includes('beisetzung');
}

/** Kalender/Kühlraum: markanter S/U-Hinweis auf Feierterminen. */
export function calendarBestattungsMarker(
  s: Sterbefall,
  arts: readonly string[],
  title: string
): BestattungsMarker | undefined {
  if (!arts.some((a) => FEIER_MARKER_ARTS.has(a))) return undefined;

  const kremation = hatKremationImSterbefall(s);
  const tfOderVerabschiedung = entryHatTrauerfeierOderVerabschiedung(arts, title);
  const beisetzung = entryHatBeisetzung(arts, title);

  if (kremation) {
    if (tfOderVerabschiedung || beisetzung) return 'U';
    return undefined;
  }
  if (tfOderVerabschiedung) return 'S';
  return undefined;
}

export function beisetzungZeitGleichTrauerfeier(s: Sterbefall): boolean {
  const tf = extractZeitDe(s.trauerfeierdatum, s.trauerfeierzeit);
  const bs = extractZeitDe(s.beisetzungsdatum, s.beisetzungszeit);
  return Boolean(tf && bs && tf === bs);
}

/** Beisetzung mit abweichender Uhrzeit (nicht Im Anschluss, nicht gleiche Zeit wie Trauerfeier). */
export function beisetzungHatEigeneUhrzeit(s: Sterbefall): boolean {
  if (istImAnschluss(s.beisetzungszeit)) return false;
  const bs = extractZeitDe(s.beisetzungsdatum, s.beisetzungszeit);
  if (!bs) return false;
  if (beisetzungZeitGleichTrauerfeier(s)) return false;
  return true;
}

/** Beisetzung gehört zur Trauerfeier (Im Anschluss oder gleiche Uhrzeit am Trauerfeier-Tag). */
export function beisetzungImAnschlussAmTrauerfeierTag(s: Sterbefall): boolean {
  if (beisetzungHatEigeneUhrzeit(s)) return false;
  const tfDay = dayKeyFromDeDatum(s.trauerfeierdatum);
  if (!tfDay) return false;
  const bsDay = dayKeyFromDeDatum(s.beisetzungsdatum);
  if (bsDay && bsDay !== tfDay) return false;
  return sterbefallImAnschluss(s) || beisetzungZeitGleichTrauerfeier(s);
}

/** Eigener Beisetzungs-Marker (anderer Tag oder andere Uhrzeit). */
export function beisetzungAlsEigenerTermin(s: Sterbefall): boolean {
  if (!extractDeDatum(s.beisetzungsdatum)) return false;
  return !beisetzungImAnschlussAmTrauerfeierTag(s);
}

export function rosenkranzUndTrauerfeier1AmSelbenTag(s: Sterbefall): boolean {
  const rkDay = dayKeyFromDeDatum(s.rosenkranzdatum);
  const tfDay = dayKeyFromDeDatum(s.trauerfeierdatum);
  return Boolean(rkDay && tfDay && rkDay === tfDay);
}
