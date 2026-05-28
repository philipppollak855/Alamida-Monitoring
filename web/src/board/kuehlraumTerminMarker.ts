import type { Sterbefall } from '../types';
import { isAusstehendHeuteOrGeplant } from './ausstehendStatus';
import { extractDeDatum, parseDatumDeToDate } from './dateUtils';
import {
  beisetzungAlsEigenerTermin,
  rosenkranzUndTrauerfeier1AmSelbenTag,
} from './feierterminLogic';
import { istKrematorium } from './ortKeywords';

export type KuehlraumTerminMarkerKind =
  | 'kremation'
  | 'beisetzung'
  | 'trauerfeier'
  | 'verabschiedung';

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
  verabschiedung: 'Verabschiedung',
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

function feierMarkerKindTf1(s: Sterbefall): KuehlraumTerminMarkerKind {
  if (!beisetzungAlsEigenerTermin(s)) return 'trauerfeier';
  if (rosenkranzUndTrauerfeier1AmSelbenTag(s)) return 'verabschiedung';
  return 'trauerfeier';
}

function feierMarkerKindTf2(s: Sterbefall): KuehlraumTerminMarkerKind {
  if (!beisetzungAlsEigenerTermin(s)) return 'trauerfeier';
  return 'verabschiedung';
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

/** Relevante Termine für Kühlraum-Kacheln (Kalender-Regeln für Feier/Beisetzung). */
export function buildKuehlraumTerminMarkers(
  s: Sterbefall,
  now: Date = new Date()
): KuehlraumTerminMarker[] {
  const markers: KuehlraumTerminMarker[] = [];
  const bsEigenerTermin = beisetzungAlsEigenerTermin(s);

  const tf1 = extractDeDatum(s.trauerfeierdatum);
  if (tf1) {
    const kind = feierMarkerKindTf1(s);
    const m = formatMarkerLabel(kind, tf1, now);
    if (m) markers.push(m);
  }

  const tf2 = extractDeDatum(s.trauerfeier2datum);
  if (tf2) {
    const m = formatMarkerLabel(feierMarkerKindTf2(s), tf2, now);
    if (m) markers.push(m);
  }

  if (hatKremationImAblauf(s)) {
    const kr = formatMarkerLabel('kremation', findeKremationTermin(s), now);
    if (kr) markers.push(kr);
  }

  if (bsEigenerTermin) {
    const beisetzung = extractDeDatum(s.beisetzungsdatum);
    if (beisetzung) {
      const b = formatMarkerLabel('beisetzung', beisetzung, now);
      if (b) markers.push(b);
    }
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
