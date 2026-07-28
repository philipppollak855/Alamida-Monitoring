import type { Sterbefall } from '../types';
import { istManuellAusgeschlossen } from './fallAbschluss';
import { extractDeDatum } from './dateUtils';

function hatGueltigesDatum(raw?: string): boolean {
  return !!raw?.trim() && /\d{1,2}\.\d{1,2}\.\d{4}/.test(raw.trim());
}

function normalizeNameKey(raw?: string): string {
  return (raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Alamida-Platzhalter „Nachname Verstorbener“ (und Varianten) — immer Fehleinträge.
 */
export function istFehlerhafterPlatzhalterFall(s: Sterbefall): boolean {
  const name = normalizeNameKey(s.verstorbenerName);
  if (
    name === 'nachname verstorbener' ||
    name === 'verstorbener nachname' ||
    name === 'nachname, verstorbener' ||
    name === 'verstorbener, nachname'
  ) {
    return true;
  }

  const vor = normalizeNameKey(s.verstorbenerVorname);
  const nach = normalizeNameKey(s.verstorbenerNachname);
  if (
    (vor === 'verstorbener' && nach === 'nachname') ||
    (vor === 'nachname' && nach === 'verstorbener')
  ) {
    return true;
  }

  return false;
}

export function istImAnschluss(raw?: boolean | string): boolean {
  if (raw === true) return true;
  if (!raw) return false;
  const t = String(raw).trim().toLowerCase();
  return (
    t === '1' ||
    t === 'ja' ||
    t === 'yes' ||
    t === 'true' ||
    t === 'x' ||
    t.includes('im anschluss') ||
    t.includes('im anschluß')
  );
}

/** Checkbox oder Beisetzungszeit „Im Anschluss“ (Alamida). */
export function sterbefallImAnschluss(s: Sterbefall): boolean {
  return istImAnschluss(s.imAnschluss) || istImAnschluss(s.beisetzungszeit);
}

export function hatFeierterminInDaten(s: Sterbefall): boolean {
  return Boolean(
    extractDeDatum(s.trauerfeierdatum) ||
      extractDeDatum(s.trauerfeier2datum) ||
      extractDeDatum(s.beisetzungsdatum) ||
      extractDeDatum(s.rosenkranzdatum)
  );
}

/** Kalender: auch archivierte Fälle mit Feierterminen (Wall-Tabs nutzen weiter filterAktive). */
export function filterSterbefaelleFuerKalender(sterbefaelle: Sterbefall[]): Sterbefall[] {
  return sterbefaelle.filter((s) => {
    if (istFehlerhafterPlatzhalterFall(s)) return false;
    if (istManuellAusgeschlossen(s.historieGrund)) return false;
    if (!istInHistory(s)) return true;
    return hatFeierterminInDaten(s);
  });
}

function parseDatumZeitDe(datum?: string, zeit?: string, endOfDayIfNoTime = false): number | null {
  if (!hatGueltigesDatum(datum)) return null;
  const m = datum!.trim().match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;

  let h = endOfDayIfNoTime ? 23 : 0;
  let min = endOfDayIfNoTime ? 59 : 0;
  let sec = endOfDayIfNoTime ? 59 : 0;
  let ms = endOfDayIfNoTime ? 999 : 0;

  if (zeit?.trim()) {
    const tm = zeit.trim().match(/(\d{1,2})[.:](\d{2})/);
    if (tm) {
      h = +tm[1];
      min = +tm[2];
      sec = 0;
      ms = 0;
    }
  }

  return new Date(+m[3], +m[2] - 1, +m[1], h, min, sec, ms).getTime();
}

/** Beisetzung/Trauerfeier abgelaufen — nur Terminregeln, ohne sichtbarBis/Flags. */
export function istNachBeisetzungOderTrauerfeierAbgelaufenCeremony(
  s: Sterbefall,
  jetzt = Date.now()
): boolean {
  if (sterbefallImAnschluss(s) && hatGueltigesDatum(s.trauerfeierdatum)) {
    const trauerfeier = parseDatumZeitDe(s.trauerfeierdatum, s.trauerfeierzeit);
    if (trauerfeier != null && jetzt >= trauerfeier + 2 * 60 * 60 * 1000) return true;
  }

  if (hatGueltigesDatum(s.beisetzungsdatum)) {
    const hatUhrzeit = !!s.beisetzungszeit?.trim() && /\d{1,2}[.:]\d{2}/.test(s.beisetzungszeit);
    const beisetzung = parseDatumZeitDe(s.beisetzungsdatum, s.beisetzungszeit, false);
    if (beisetzung == null) return false;
    const m = s.beisetzungsdatum!.trim().match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    const bis = hatUhrzeit
      ? beisetzung + 2 * 60 * 60 * 1000
      : m
        ? new Date(+m[3], +m[2] - 1, +m[1], 23, 59, 59, 999).getTime()
        : beisetzung;
    if (jetzt >= bis) return true;
  }

  return false;
}

/**
 * Beisetzung/Trauerfeier abgelaufen.
 * `sichtbarBis` verlängert die Sichtbarkeit, verkürzt sie aber nicht vor dem Terminfenster
 * (Agent setzt sichtbarBis manchmal auf Tagesbeginn → Fälle verschwinden morgens).
 */
export function istNachBeisetzungOderTrauerfeierAbgelaufen(s: Sterbefall): boolean {
  const jetzt = Date.now();
  const ceremonyExpired = istNachBeisetzungOderTrauerfeierAbgelaufenCeremony(s, jetzt);

  if (s.sichtbarBis?.seconds) {
    const bis = s.sichtbarBis.seconds * 1000;
    // Noch innerhalb sichtbarBis → sichtbar (Verlängerung)
    if (jetzt < bis) return false;
    // sichtbarBis vorbei: nur ausblenden, wenn auch das Terminfenster vorbei ist
    // (oder kein berechenbares Terminfenster existiert)
    const hatTermin =
      (sterbefallImAnschluss(s) && hatGueltigesDatum(s.trauerfeierdatum)) ||
      hatGueltigesDatum(s.beisetzungsdatum);
    if (hatTermin) return ceremonyExpired;
    return true;
  }

  return ceremonyExpired;
}

/**
 * Fall aus Disposition/Wall ausblenden (Agent-Flag oder abgelaufene Beisetzung/Trauerfeier).
 */
export function istInHistory(s: Sterbefall): boolean {
  if (istFehlerhafterPlatzhalterFall(s)) return true;
  if (istManuellAusgeschlossen(s.historieGrund ?? s.abschlussGrund)) return true;
  if (s.aktivInDisposition === false) return true;

  // Vorzeitiges Agent-Archiv am Feiertag: inHistory erst nach echtem Terminende
  if (s.inHistory === true) {
    if (hatFeierterminInDaten(s) && !istNachBeisetzungOderTrauerfeierAbgelaufen(s)) {
      return false;
    }
    return true;
  }

  return istNachBeisetzungOderTrauerfeierAbgelaufen(s);
}

export function filterAktiveSterbefaelle(sterbefaelle: Sterbefall[]): Sterbefall[] {
  return sterbefaelle.filter((s) => !istInHistory(s));
}
