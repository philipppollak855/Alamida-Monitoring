import { parseDatumDeToDate } from './dateUtils';

function startOfDayMs(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/**
 * Freigabe gilt erst ab heute (Kalendertag).
 * Zukünftiges Freigabedatum → Eintrag bleibt „nicht frei“ (rot).
 */
export function istFreigabeWirksam(
  freigabeFrei?: boolean,
  freigabeDatum?: string,
  ref = new Date()
): boolean {
  if (!freigabeFrei) return false;
  const freiAm = parseDatumDeToDate(freigabeDatum);
  if (!freiAm) return true;
  return startOfDayMs(freiAm) <= startOfDayMs(ref);
}

/**
 * Inklusive Kalendertage seit wirksamer Freigabe (Freigabetag = 1).
 * `null` wenn noch nicht frei oder kein parsbares Datum.
 */
export function tageSeitFreigabe(
  freigabeFrei?: boolean,
  freigabeDatum?: string,
  ref = new Date()
): number | null {
  if (!istFreigabeWirksam(freigabeFrei, freigabeDatum, ref)) return null;
  const freiAm = parseDatumDeToDate(freigabeDatum);
  if (!freiAm) return null;
  const from = startOfDayMs(freiAm);
  const to = startOfDayMs(ref);
  if (to < from) return null;
  return Math.floor((to - from) / 86400000) + 1;
}

/** Kompakter Marker-Text, z. B. „1 T“ / „3 T“. */
export function tageSeitFreigabeLabel(tage: number): string {
  return `${tage} T`;
}

export function tageSeitFreigabeTitle(tage: number, freigabeDatum?: string): string {
  const basis =
    tage === 1
      ? '1 Tag seit Freigabe (Freigabetag zählt mit)'
      : `${tage} Tage seit Freigabe (Freigabetag zählt mit)`;
  return freigabeDatum ? `${basis} · seit ${freigabeDatum}` : basis;
}

export function freigabePersonCssClass(
  freigabeFrei?: boolean,
  freigabeDatum?: string,
  ref = new Date()
): 'is-frei-erfasst' | 'is-nicht-frei' {
  return istFreigabeWirksam(freigabeFrei, freigabeDatum, ref)
    ? 'is-frei-erfasst'
    : 'is-nicht-frei';
}
