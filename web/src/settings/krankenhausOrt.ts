import type { Sterbefall } from '../types';
import type { DispositionSettings } from '../types/dispositionSettings';
import { getDispositionSettings } from './dispositionSettingsStore';
import { istKrankenhausOrt } from './recognitionEngine';

function istKrankenhaus(ort?: string): boolean {
  if (!ort?.trim()) return false;
  return istKrankenhausOrt(ort, getDispositionSettings());
}

const FALLBACK_PREFIXE = ['uk ', 'uk-', 'uk.', 'kh ', 'kh-', 'kh.'];

const GENERIC_KH_KEYS = new Set([
  'uk',
  'kh',
  'k',
  'krankenhaus',
  'spital',
  'klinik',
  'klinikum',
  'landesklinik',
  'universitaetsklinik',
  'universitätsklinik',
]);

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

export function isGenericKrankenhausKey(key: string): boolean {
  const k = key.trim().toLowerCase();
  return !k || k.length < 3 || GENERIC_KH_KEYS.has(k);
}

/**
 * Gruppierungsschlüssel — gleiche Klinik trotz UK/KH/Krankenhaus/Schreibweise.
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

  const raw = ort.trim().toLowerCase().replace(/[\s.\-_]+/g, '');
  const result = s || raw;
  if (isGenericKrankenhausKey(result)) return result;
  return result;
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
  if (isGenericKrankenhausKey(key)) return ort.trim();
  const city = titleCaseOrt(key);
  if (!city) return ort.trim();
  return `UK - ${city}`;
}

/** Alle Orts-Strings eines Falls, die ein KH bezeichnen können. */
export function collectKrankenhausKandidaten(s: Sterbefall): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const add = (v?: string, force = false) => {
    const t = v?.trim();
    if (!t) return;
    const norm = t.toLowerCase();
    if (seen.has(norm)) return;
    if (!force && !istKrankenhaus(t)) return;
    seen.add(norm);
    out.push(t);
  };

  add(s.aktuellePosition);
  add(s.sterbeort);
  add(s.abholort, !!s.abholortIstKrankenhaus);
  add(s.naechsterSchrittVon);
  add(s.naechsterSchrittNach);
  add(s.naechsteUeberfuehrungVon);
  add(s.naechsteUeberfuehrungNach);

  for (const v of s.verlauf ?? []) {
    add(v.ort);
    add(v.vonOrt);
    add(v.nachOrt);
  }
  for (const a of s.ausstehend ?? []) {
    add(a.vonOrt);
    add(a.nachOrt);
  }

  return out;
}

/** Bester Ortsname für Gruppierung (längster spezifischer Schlüssel, nicht nur „UK“). */
export function resolveBestKrankenhausOrt(
  kandidaten: string[],
  settings?: DispositionSettings
): string | null {
  if (kandidaten.length === 0) return null;

  let bestOrt: string | null = null;
  let bestKeyLen = -1;

  for (const ort of kandidaten) {
    const key = krankenhausOrtKey(ort, settings);
    if (isGenericKrankenhausKey(key)) continue;
    if (key.length > bestKeyLen) {
      bestKeyLen = key.length;
      bestOrt = ort;
    }
  }

  if (bestOrt) return bestOrt;

  return kandidaten.reduce((a, b) => (a.trim().length >= b.trim().length ? a : b));
}

export function preferKrankenhausAnzeigeLabel(a: string, b: string): string {
  return canonicalKrankenhausAnzeigeLabel(a.length >= b.length ? a : b);
}
