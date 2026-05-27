import type { Sterbefall } from '../types';
import { isAusstehendHeuteOrGeplant } from './ausstehendStatus';
import { extractDeDatum, parseDatumDeToDate } from './dateUtils';
import { istImAnschluss } from './historieLogic';
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

function findeTrauerfeierDaten(s: Sterbefall): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw?: string) => {
    const d = extractDeDatum(raw);
    if (!d) return;
    const key = d.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(d);
  };
  add(s.trauerfeierdatum);
  add(s.trauerfeier2datum);
  return out;
}

function findeBeisetzungsDatum(s: Sterbefall): string | undefined {
  return extractDeDatum(s.beisetzungsdatum) ?? undefined;
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
  now: Date,
  offenLabel?: string
): KuehlraumTerminMarker | null {
  const prefix = MARKER_PREFIX[kind];
  if (!datum?.trim() || !parseDatumDeToDate(datum)) {
    if (kind === 'kremation' || offenLabel) {
      return {
        kind,
        datum: '',
        relativeLabel: '',
        label: offenLabel ?? `${prefix} — Termin offen`,
      };
    }
    return null;
  }
  const d = datum.trim();
  const relativeLabel = relativeTerminLabel(d, now);
  const label = relativeLabel ? `${prefix} ${relativeLabel} · ${d}` : `${prefix} · ${d}`;
  return { kind, datum: d, relativeLabel, label };
}

/** Relevante Termine für Kühlraum-Kacheln (Trauerfeier, Kremation, Beisetzung). */
export function buildKuehlraumTerminMarkers(
  s: Sterbefall,
  now: Date = new Date()
): KuehlraumTerminMarker[] {
  const markers: KuehlraumTerminMarker[] = [];

  for (const tfDatum of findeTrauerfeierDaten(s)) {
    const tf = formatMarkerLabel('trauerfeier', tfDatum, now);
    if (tf) markers.push(tf);
  }

  if (hatKremationImAblauf(s)) {
    const kr = formatMarkerLabel('kremation', findeKremationTermin(s), now);
    if (kr) markers.push(kr);
  }

  const beisetzung = findeBeisetzungsDatum(s);
  if (beisetzung) {
    const b = formatMarkerLabel('beisetzung', beisetzung, now);
    if (b) markers.push(b);
  } else if (istImAnschluss(s.imAnschluss)) {
    const b = formatMarkerLabel('beisetzung', undefined, now, 'Beisetzung im Anschluss');
    if (b) markers.push(b);
  }

  return markers;
}

/** @deprecated Einzelmarker — nutzt ersten Eintrag aus {@link buildKuehlraumTerminMarkers}. */
export function buildKuehlraumTerminMarker(
  s: Sterbefall,
  now: Date = new Date()
): KuehlraumTerminMarker | null {
  return buildKuehlraumTerminMarkers(s, now)[0] ?? null;
}
