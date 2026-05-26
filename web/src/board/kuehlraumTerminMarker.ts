import type { Sterbefall } from '../types';
import { isAusstehendHeuteOrGeplant } from './ausstehendStatus';
import { parseDatumDeToDate } from './dateUtils';
import { istKrematorium } from './ortKeywords';

export type KuehlraumTerminMarkerKind = 'kremation' | 'beisetzung' | 'trauerfeier';

export interface KuehlraumTerminMarker {
  kind: KuehlraumTerminMarkerKind;
  datum: string;
  relativeLabel: string;
  /** Anzeigezeile, z. B. „Kremation in 2 Tagen · 24.05.2026“ */
  label: string;
}

const MARKER_PREFIX: Record<KuehlraumTerminMarkerKind, string> = {
  kremation: 'Kremation',
  beisetzung: 'Beisetzung',
  trauerfeier: 'Trauerfeier',
};

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

function hatKremationImAblauf(s: Sterbefall): boolean {
  if ((s.ausstehend ?? []).some(istOffenerKremationsschritt)) return true;
  if (s.naechsterSchrittTyp === 'kremation') return true;
  if (s.endzielTyp === 'kremation') return true;
  if (s.endziel?.trim() && istKrematorium(s.endziel)) return true;
  return false;
}

function findeKremationTermin(s: Sterbefall): string | undefined {
  const ausstehend = (s.ausstehend ?? []).find(istOffenerKremationsschritt);
  const t = ausstehend?.terminAm?.trim() || ausstehend?.abholungAm?.trim();
  if (t) return t;
  if (s.naechsterSchrittTyp === 'kremation') {
    return s.naechsterSchrittAm?.trim() || undefined;
  }
  return undefined;
}

function findeErsteTrauerfeierDatum(s: Sterbefall): string | undefined {
  const d = s.trauerfeierdatum?.trim();
  return d && parseDatumDeToDate(d) ? d : undefined;
}

function dayMs(datum?: string): number | null {
  const d = parseDatumDeToDate(datum);
  if (!d) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function relativeTerminLabel(datum: string, now: Date): string {
  const target = parseDatumDeToDate(datum);
  if (!target) return '';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const diffDays = Math.round((day.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) {
    if (diffDays === -1) return 'gestern';
    return `vor ${-diffDays} Tagen`;
  }
  if (diffDays === 0) return 'heute';
  if (diffDays === 1) return 'morgen';
  return `in ${diffDays} Tagen`;
}

function formatMarkerLabel(
  kind: KuehlraumTerminMarkerKind,
  datum: string | undefined,
  now: Date
): KuehlraumTerminMarker | null {
  const prefix = MARKER_PREFIX[kind];
  if (!datum?.trim() || !parseDatumDeToDate(datum)) {
    if (kind === 'kremation') {
      return {
        kind,
        datum: '',
        relativeLabel: '',
        label: `${prefix} — Termin offen`,
      };
    }
    return null;
  }
  const d = datum.trim();
  const relativeLabel = relativeTerminLabel(d, now);
  const label = relativeLabel ? `${prefix} ${relativeLabel} · ${d}` : `${prefix} · ${d}`;
  return { kind, datum: d, relativeLabel, label };
}

function trauerfeierVorKremationAnzeigen(
  trauerfeierDatum: string | undefined,
  kremationDatum: string | undefined
): boolean {
  if (!trauerfeierDatum) return false;
  if (!kremationDatum) return true;
  const tf = dayMs(trauerfeierDatum);
  const kr = dayMs(kremationDatum);
  if (tf == null || kr == null) return !kremationDatum;
  return tf < kr;
}

/** Relevante Termine für Kühlraum-Kacheln (Kremation ± Trauerfeier, sonst Beisetzung). */
export function buildKuehlraumTerminMarkers(
  s: Sterbefall,
  now: Date = new Date()
): KuehlraumTerminMarker[] {
  if (hatKremationImAblauf(s)) {
    const kremationDatum = findeKremationTermin(s);
    const trauerfeierDatum = findeErsteTrauerfeierDatum(s);
    const markers: KuehlraumTerminMarker[] = [];

    if (trauerfeierVorKremationAnzeigen(trauerfeierDatum, kremationDatum)) {
      const tf = formatMarkerLabel('trauerfeier', trauerfeierDatum, now);
      if (tf) markers.push(tf);
    }

    const kr = formatMarkerLabel('kremation', kremationDatum, now);
    if (kr) markers.push(kr);

    return markers;
  }

  const beisetzung = s.beisetzungsdatum?.trim();
  if (beisetzung && parseDatumDeToDate(beisetzung)) {
    const b = formatMarkerLabel('beisetzung', beisetzung, now);
    return b ? [b] : [];
  }

  return [];
}

/** @deprecated Einzelmarker — nutzt ersten Eintrag aus {@link buildKuehlraumTerminMarkers}. */
export function buildKuehlraumTerminMarker(
  s: Sterbefall,
  now: Date = new Date()
): KuehlraumTerminMarker | null {
  return buildKuehlraumTerminMarkers(s, now)[0] ?? null;
}
