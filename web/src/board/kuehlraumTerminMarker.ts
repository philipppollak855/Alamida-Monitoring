import type { Sterbefall } from '../types';
import { isAusstehendHeuteOrGeplant } from './ausstehendStatus';
import { parseDatumDeToDate } from './dateUtils';
import { istKrematorium } from './ortKeywords';

export type KuehlraumTerminMarkerKind = 'kremation' | 'beisetzung';

export interface KuehlraumTerminMarker {
  kind: KuehlraumTerminMarkerKind;
  datum: string;
  relativeLabel: string;
  /** Anzeigezeile, z. B. „Kremation in 2 Tagen · 24.05.2026“ */
  label: string;
}

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
  const prefix = kind === 'kremation' ? 'Kremation' : 'Beisetzung';
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

/** Nächster relevanter Termin für Kühlraum-Kacheln: Kremation oder Beisetzung. */
export function buildKuehlraumTerminMarker(
  s: Sterbefall,
  now: Date = new Date()
): KuehlraumTerminMarker | null {
  if (hatKremationImAblauf(s)) {
    const marker = formatMarkerLabel('kremation', findeKremationTermin(s), now);
    if (marker) return marker;
  }

  const beisetzung = s.beisetzungsdatum?.trim();
  if (beisetzung && parseDatumDeToDate(beisetzung)) {
    return formatMarkerLabel('beisetzung', beisetzung, now);
  }

  return null;
}
