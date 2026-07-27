import type { Sterbefall } from '../types';
import { extractDeDatum, extractZeitDe, parseDatumDeToDate } from './dateUtils';
import {
  beisetzungAlsEigenerTermin,
  beisetzungImAnschlussAmTrauerfeierTag,
  type BestattungsMarker,
  findeKremationTermin,
  hatKremationImSterbefall,
  istBereitsAlsUrne,
  kuehlraumBestattungsMarker,
  trauerfeier1AlsVerabschiedung,
} from './feierterminLogic';

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
  bestattungsMarker?: BestattungsMarker;
  zeit?: string;
  ort?: string;
}

const MARKER_PREFIX: Record<KuehlraumTerminMarkerKind, string> = {
  kremation: 'Kremation',
  beisetzung: 'Beisetzung',
  trauerfeier: 'Trauerfeier',
  verabschiedung: 'Verabschiedung',
};

function hatKremationImAblauf(s: Sterbefall): boolean {
  return hatKremationImSterbefall(s);
}

function feierMarkerKindTf1(s: Sterbefall): Exclude<KuehlraumTerminMarkerKind, 'kremation'> {
  return trauerfeier1AlsVerabschiedung(s) ? 'verabschiedung' : 'trauerfeier';
}

function feierMarkerKindTf2(s: Sterbefall): Exclude<KuehlraumTerminMarkerKind, 'kremation'> {
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
  opts?: { offenLabel?: string; zeit?: string; ort?: string }
): KuehlraumTerminMarker | null {
  const prefix = MARKER_PREFIX[kind];
  const zeit = opts?.zeit?.trim() || undefined;
  const ort = opts?.ort?.trim() || undefined;
  if (!datum?.trim() || !parseDatumDeToDate(datum)) {
    if (kind === 'kremation' || opts?.offenLabel) {
      return {
        kind,
        datum: '',
        relativeLabel: '',
        label: opts?.offenLabel ?? `${prefix} — Termin offen`,
        zeit,
        ort,
      };
    }
    return null;
  }
  const d = datum.trim();
  const relativeLabel = relativeTerminLabel(d, now);
  const detail = [zeit, ort].filter(Boolean).join(' · ');
  const label = relativeLabel
    ? `${prefix} ${relativeLabel} · ${d}${detail ? ` · ${detail}` : ''}`
    : `${prefix} · ${d}${detail ? ` · ${detail}` : ''}`;
  return { kind, datum: d, relativeLabel, label, zeit, ort };
}

function withKuehlraumBestattungsMarker(
  s: Sterbefall,
  marker: KuehlraumTerminMarker,
  now: Date
): KuehlraumTerminMarker {
  if (marker.kind === 'kremation') return marker;
  return {
    ...marker,
    bestattungsMarker: kuehlraumBestattungsMarker(s, marker.kind, now, marker.datum),
  };
}

function pushFeierMarker(
  list: KuehlraumTerminMarker[],
  s: Sterbefall,
  kind: Exclude<KuehlraumTerminMarkerKind, 'kremation'>,
  datum: string | undefined,
  now: Date,
  opts?: { zeit?: string; ort?: string }
) {
  const m = formatMarkerLabel(kind, datum, now, opts);
  if (m) list.push(withKuehlraumBestattungsMarker(s, m, now));
}

/** Relevante Termine für Kühlraum-Kacheln (Kalender-Regeln für Feier/Beisetzung). */
export function buildKuehlraumTerminMarkers(
  s: Sterbefall,
  now: Date = new Date()
): KuehlraumTerminMarker[] {
  const markers: KuehlraumTerminMarker[] = [];
  const bsEigenerTermin = beisetzungAlsEigenerTermin(s);
  const ortTf = s.trauerfeierort?.trim() || s.endziel?.trim() || undefined;
  const ortBeisetzung = s.endziel?.trim() || undefined;

  const tf1 = extractDeDatum(s.trauerfeierdatum);
  if (tf1) {
    pushFeierMarker(markers, s, feierMarkerKindTf1(s), tf1, now, {
      zeit: extractZeitDe(s.trauerfeierdatum, s.trauerfeierzeit),
      ort: ortTf,
    });
  }

  const tf2 = extractDeDatum(s.trauerfeier2datum);
  if (tf2) {
    pushFeierMarker(markers, s, feierMarkerKindTf2(s), tf2, now, {
      zeit: extractZeitDe(s.trauerfeier2datum, s.trauerfeier2zeit),
      ort: s.trauerfeier2ort?.trim() || ortTf,
    });
  }

  if (hatKremationImAblauf(s) && !istBereitsAlsUrne(s)) {
    const kremDatum = findeKremationTermin(s);
    const kremAusstehend = (s.ausstehend ?? []).find((a) => a.schrittTyp === 'kremation');
    const kremVerlauf = (s.verlauf ?? []).find((v) => (v.typ ?? '').toLowerCase() === 'kremation');
    const kr = formatMarkerLabel('kremation', kremDatum, now, {
      zeit: extractZeitDe(kremDatum),
      ort:
        kremAusstehend?.nachOrt?.trim() ||
        kremAusstehend?.vonOrt?.trim() ||
        kremVerlauf?.nachOrt?.trim() ||
        kremVerlauf?.vonOrt?.trim() ||
        kremVerlauf?.ort?.trim(),
    });
    if (kr) markers.push(kr);
  }

  if (bsEigenerTermin) {
    const beisetzung = extractDeDatum(s.beisetzungsdatum);
    if (beisetzung) {
      const imAnschluss = beisetzungImAnschlussAmTrauerfeierTag(s);
      pushFeierMarker(markers, s, 'beisetzung', beisetzung, now, {
        zeit: imAnschluss
          ? 'Im Anschluss'
          : extractZeitDe(s.beisetzungsdatum, s.beisetzungszeit),
        ort: ortBeisetzung,
      });
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
