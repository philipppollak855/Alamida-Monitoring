import type { Sterbefall, OffeneUeberfuehrungRow } from '../types';
import { KUEHLRAUM_CONFIG, matchKuehlraumConfig } from '../kuehlraumConfig';

export function parseDatumDe(s?: string): number {
  if (!s) return Number.MAX_SAFE_INTEGER;
  const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
}

export function flattenOffene(sterbefaelle: Sterbefall[]): OffeneUeberfuehrungRow[] {
  const rows: OffeneUeberfuehrungRow[] = [];
  for (const s of sterbefaelle) {
    const id = s.sterbefallId ?? s.id;
    const name = s.verstorbenerName ?? id;
    for (const a of s.ausstehend ?? []) {
      rows.push({
        sterbefallId: id,
        name,
        schrittTyp: a.schrittTyp ?? 'ueberfuehrung',
        vonOrt: a.vonOrt ?? '—',
        nachOrt: a.nachOrt ?? '—',
        terminAm: a.terminAm ?? a.abholungAm ?? 'ohne Datum',
        status: a.status ?? 'geplant',
        endziel: s.endziel,
        endzielTyp: s.endzielTyp,
        istAbholungVomSterbeort: a.istAbholungVomSterbeort,
        abholortIstKrankenhaus: s.abholortIstKrankenhaus,
      });
    }
  }
  return rows.sort((a, b) => parseDatumDe(a.terminAm) - parseDatumDe(b.terminAm));
}

export function buildGrafenbachSlots(sterbefaelle: Sterbefall[]) {
  const cfg = KUEHLRAUM_CONFIG['Kühlr. Grafenbach'];
  const slots: (Sterbefall | null)[] = Array(cfg.plaetze).fill(null);
  for (const s of sterbefaelle) {
    if (s.status !== 'im_kuehlraum') continue;
    if (!matchKuehlraumConfig(s.kuehlraumId)) continue;
    const platz = parseInt(s.kuehlplatz ?? '', 10);
    const idx =
      platz >= 1 && platz <= cfg.plaetze ? platz - 1 : slots.findIndex((x) => x === null);
    if (idx >= 0 && idx < cfg.plaetze && slots[idx] === null) slots[idx] = s;
  }
  return { cfg, slots };
}

export function boardStats(sterbefaelle: Sterbefall[], offene: OffeneUeberfuehrungRow[]) {
  const heute = offene.filter((o) => o.status === 'heute').length;
  const abholung = offene.filter((o) => o.istAbholungVomSterbeort || o.status === 'abholung_noetig').length;
  const imKr = sterbefaelle.filter((s) => s.status === 'im_kuehlraum').length;
  const aktiv = sterbefaelle.filter((s) => s.aktivInAlamida).length;
  return { heute, abholung, imKr, aktiv, offen: offene.length };
}
