import type { Sterbefall } from '../types';

/**
 * Fälle nur ausblenden, wenn der Agent sie explizit archiviert hat (Beisetzung/Trauerfeier abgelaufen).
 * Kein clientseitiges Ausfiltern nach Datum — verhindert falsches Verschwinden bei Mapping-Fehlern.
 */
export function istInHistory(s: Sterbefall): boolean {
  return s.inHistory === true;
}

export function filterAktiveSterbefaelle(sterbefaelle: Sterbefall[]): Sterbefall[] {
  return sterbefaelle.filter((s) => !istInHistory(s));
}
