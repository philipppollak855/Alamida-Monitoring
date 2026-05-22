import type { DispositionSettings } from '../types/dispositionSettings';
import { getDispositionSettings } from './dispositionSettingsStore';

const FALLBACK_PREFIXE = ['uk ', 'uk-', 'uk.', 'kh ', 'kh-', 'kh.'];

/** UK/KH/Krankenhaus… am Anfang (inkl. „UK - “). */
const LEADING_MARKER = /^(uk|kh|uk\.|kh\.)[\s.\-_]+/i;
const LEADING_KH_WORD =
  /^(krankenhaus|spital|klinik|landesklinik|universitätsklinik|universitaetsklinik|klinikum)[\s.\-_]+/i;

function stripLeadingMarkers(s: string): string {
  let prev = '';
  let cur = s;
  while (cur !== prev) {
    prev = cur;
    cur = cur
      .replace(LEADING_MARKER, '')
      .replace(LEADING_KH_WORD, '')
      .trim();
  }
  return cur;
}

/**
 * Gruppierungsschlüssel — gleiche Klinik trotz UK/KH/Krankenhaus/Schreibweise.
 * z. B. UK Neunkirchen, KH-Neunkirchen, Krankenhaus Neunkirchen → „neunkirchen“
 */
export function krankenhausOrtKey(ort: string, settings?: DispositionSettings): string {
  let s = ort.trim().toLowerCase();
  s = stripLeadingMarkers(s);

  const cfg = settings ?? getDispositionSettings();
  const prefixe = [
    ...cfg.krankenhausPrefixe.map((p) => p.trim().toLowerCase()),
    ...FALLBACK_PREFIXE,
  ]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const p of prefixe) {
    if (s.startsWith(p)) {
      s = s.slice(p.length);
      break;
    }
  }

  s = stripLeadingMarkers(s);

  for (const kw of cfg.krankenhausKeywords) {
    const k = kw.trim().toLowerCase();
    if (!k) continue;
    if (s.startsWith(k)) {
      s = s.slice(k.length).replace(/^[\s.\-_]+/, '');
    }
    if (s.endsWith(k)) {
      s = s.slice(0, -k.length).replace(/[\s.\-_]+$/, '');
    }
  }

  s = stripLeadingMarkers(s);
  s = s.replace(/^[\s.\-_]+/, '').replace(/[\s.\-_]+/g, '');

  return s || ort.trim().toLowerCase().replace(/[\s.\-_]+/g, '');
}

function titleCaseOrt(key: string): string {
  if (!key) return key;
  return key
    .split(/[\s.\-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Einheitliche Kartenüberschrift für Extern, z. B. „UK - Neunkirchen“. */
export function canonicalKrankenhausAnzeigeLabel(
  ort: string,
  settings?: DispositionSettings
): string {
  const key = krankenhausOrtKey(ort, settings);
  const city = titleCaseOrt(key);
  if (!city) return ort.trim();
  return `UK - ${city}`;
}

/** @deprecated Nutze canonicalKrankenhausAnzeigeLabel für Gruppenköpfe. */
export function preferKrankenhausAnzeigeLabel(a: string, b: string): string {
  return canonicalKrankenhausAnzeigeLabel(
    rankRaw(a) >= rankRaw(b) ? a : b
  );
}

function rankRaw(x: string): number {
  const t = x.trim().toLowerCase();
  if (/^uk[\s.\-_]/.test(t)) return 4;
  if (/^kh[\s.\-_]/.test(t)) return 2;
  if (/^krankenhaus[\s.\-_]/.test(t)) return 1;
  return 0;
}
