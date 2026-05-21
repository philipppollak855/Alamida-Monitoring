import type { DispositionSettings, EigenerKuehlraumConfig } from '../types/dispositionSettings';

export type OrtErkennungErgebnis = {
  ort: string;
  kremation: boolean;
  krankenhaus: boolean;
  eigenerKuehlraum: EigenerKuehlraumConfig | null;
  treffer: string[];
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Normalisiert ein Keyword (trim, lowercase für Vergleich). */
export function normalizeKeyword(kw: string): string {
  return kw.trim().toLowerCase();
}

/** Entfernt Duplikate, leere Einträge; behält Reihenfolge. */
export function dedupeKeywords(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const k = raw.trim();
    if (!k) continue;
    const key = normalizeKeyword(k);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(k);
  }
  return out;
}

/**
 * Enthält-Match mit Wortgrenzen bei kurzen Keywords (≥2 Zeichen),
 * um Fehl-Treffer zu reduzieren (z. B. „fe“ in „feuerbach“).
 */
export function keywordMatchesText(text: string, keyword: string): boolean {
  const k = normalizeKeyword(keyword);
  if (k.length < 2) return false;
  const t = text.toLowerCase();

  if (k.length >= 4 || k.includes(' ') || k.includes('-')) {
    return t.includes(k);
  }

  const boundary = new RegExp(
    `(?:^|[\\s,./(]|['"])${escapeRegex(k)}(?:$|[\\s,./)]|['"]|-)`,
    'i'
  );
  return boundary.test(text) || t.includes(k);
}

export function prefixMatchesText(text: string, prefix: string): boolean {
  const p = prefix.trim();
  if (!p) return false;
  return text.trim().toLowerCase().startsWith(p.toLowerCase());
}

export function istKrematoriumOrt(ort: string, settings: DispositionSettings): boolean {
  return settings.kremationKeywords.some((kw) => keywordMatchesText(ort, kw));
}

export function istKrankenhausOrt(ort: string, settings: DispositionSettings): boolean {
  if (settings.krankenhausPrefixe.some((p) => prefixMatchesText(ort, p))) return true;
  return settings.krankenhausKeywords.some((kw) => keywordMatchesText(ort, kw));
}

export function matchEigenerKuehlraumOrt(
  ort: string,
  settings: DispositionSettings
): EigenerKuehlraumConfig | null {
  const lower = ort.trim().toLowerCase();
  for (const kr of settings.eigeneKuehlraeume) {
    if (kr.alamidaName?.trim()) {
      const name = kr.alamidaName.trim().toLowerCase();
      if (lower === name || lower.includes(name)) return kr;
    }
    for (const kw of kr.matchKeywords) {
      if (keywordMatchesText(ort, kw)) return kr;
    }
  }
  const generic = /kühlr\.?|kuehlr\.?/i;
  if (generic.test(ort) && settings.eigeneKuehlraeume.length > 0) {
    return settings.eigeneKuehlraeume[0];
  }
  return null;
}

/** Vollständige Klassifikation eines Ortsnamens (für Prüfen-UI). */
export function classifyOrt(ort: string, settings: DispositionSettings): OrtErkennungErgebnis {
  const trimmed = ort.trim();
  const treffer: string[] = [];

  if (!trimmed) {
    return { ort: '', kremation: false, krankenhaus: false, eigenerKuehlraum: null, treffer: [] };
  }

  let kremation = false;
  for (const kw of settings.kremationKeywords) {
    if (keywordMatchesText(trimmed, kw)) {
      kremation = true;
      treffer.push(`Kremation: „${kw}"`);
    }
  }

  let krankenhaus = false;
  for (const p of settings.krankenhausPrefixe) {
    if (prefixMatchesText(trimmed, p)) {
      krankenhaus = true;
      treffer.push(`KH-Präfix: „${p}"`);
    }
  }
  if (!krankenhaus) {
    for (const kw of settings.krankenhausKeywords) {
      if (keywordMatchesText(trimmed, kw)) {
        krankenhaus = true;
        treffer.push(`Krankenhaus: „${kw}"`);
      }
    }
  }

  const eigenerKuehlraum = matchEigenerKuehlraumOrt(trimmed, settings);
  if (eigenerKuehlraum) {
    treffer.push(`Eigener KR: ${eigenerKuehlraum.label}`);
  }

  return { ort: trimmed, kremation, krankenhaus, eigenerKuehlraum, treffer };
}
