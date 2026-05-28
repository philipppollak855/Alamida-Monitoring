import type { Sterbefall } from '../types';
import { dayKeyFromDeDatum, extractDeDatum, extractZeitDe } from './dateUtils';
import { istImAnschluss, sterbefallImAnschluss } from './historieLogic';

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
