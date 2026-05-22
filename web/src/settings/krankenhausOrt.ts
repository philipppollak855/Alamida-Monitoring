import type { DispositionSettings } from '../types/dispositionSettings';
import { getDispositionSettings } from './dispositionSettingsStore';

const FALLBACK_PREFIXE = ['uk ', 'uk-', 'uk.', 'kh ', 'kh-', 'kh.'];

/** Gruppierungsschlüssel — gleiche Klinik trotz UK/KH/Schreibweise. */
export function krankenhausOrtKey(ort: string, settings?: DispositionSettings): string {
  let s = ort.trim().toLowerCase();
  const prefixe = [
    ...(settings ?? getDispositionSettings()).krankenhausPrefixe.map((p) =>
      p.trim().toLowerCase()
    ),
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

  s = s.replace(/^[\s.\-_]+/, '').replace(/[\s.\-_]+/g, '');
  return s || ort.trim().toLowerCase();
}

/** Anzeigename bei mehreren Schreibweisen (z. B. UK Neunkirchen bevorzugen). */
export function preferKrankenhausAnzeigeLabel(a: string, b: string): string {
  const rank = (x: string) => {
    const t = x.trim();
    if (/^uk\s/i.test(t)) return 4;
    if (/^uk-/i.test(t)) return 3;
    if (/^kh\s/i.test(t)) return 2;
    if (/^kh-/i.test(t)) return 1;
    return 0;
  };
  const ra = rank(a);
  const rb = rank(b);
  if (rb !== ra) return rb > ra ? b.trim() : a.trim();
  return a.trim().length >= b.trim().length ? a.trim() : b.trim();
}
