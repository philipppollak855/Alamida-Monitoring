import type { Sterbefall, OffeneUeberfuehrungRow } from '../types';
import type { EigenerKuehlraumConfig } from '../types/dispositionSettings';
import { getPrimaererKuehlraum } from '../settings/dispositionSettingsStore';
import { matchEigenerKuehlraum } from '../settings/ortMatchers';
import { parseDatumDe } from './dateUtils';
import { isImEigenenKuehlraum } from './kuehlraumLogic';

export { parseDatumDe } from './dateUtils';

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

export function buildPrimaerKuehlraumSlots(sterbefaelle: Sterbefall[]) {
  const cfg = getPrimaererKuehlraum();
  const slots: (Sterbefall | null)[] = Array(cfg.plaetze).fill(null);
  for (const s of sterbefaelle) {
    if (!isImEigenenKuehlraum(s)) continue;
    const matched = matchEigenerKuehlraum(s.kuehlraumId ?? s.aktuellePosition);
    if (matched && matched.id !== cfg.id) continue;
    const platz = parseInt(s.kuehlplatz ?? '', 10);
    const idx =
      platz >= 1 && platz <= cfg.plaetze ? platz - 1 : slots.findIndex((x) => x === null);
    if (idx >= 0 && idx < cfg.plaetze && slots[idx] === null) slots[idx] = s;
  }
  return { cfg, slots };
}

/** @deprecated Alias */
export const buildGrafenbachSlots = buildPrimaerKuehlraumSlots;

export function buildAlleEigeneKuehlraumSlots(
  sterbefaelle: Sterbefall[],
  kuehlraeume: EigenerKuehlraumConfig[]
) {
  return kuehlraeume.map((cfg) => {
    const slots: (Sterbefall | null)[] = Array(cfg.plaetze).fill(null);
    for (const s of sterbefaelle) {
      if (!isImEigenenKuehlraum(s)) continue;
      if (matchEigenerKuehlraum(s.kuehlraumId ?? s.aktuellePosition)?.id !== cfg.id) continue;
      const platz = parseInt(s.kuehlplatz ?? '', 10);
      const idx =
        platz >= 1 && platz <= cfg.plaetze ? platz - 1 : slots.findIndex((x) => x === null);
      if (idx >= 0 && idx < cfg.plaetze && slots[idx] === null) slots[idx] = s;
    }
    return { cfg, slots };
  });
}

export function boardStats(sterbefaelle: Sterbefall[], offene: OffeneUeberfuehrungRow[]) {
  const heute = offene.filter((o) => o.status === 'heute').length;
  const abholung = offene.filter((o) => o.istAbholungVomSterbeort || o.status === 'abholung_noetig').length;
  const imKr = sterbefaelle.filter((s) => isImEigenenKuehlraum(s)).length;
  const aktiv = sterbefaelle.filter((s) => s.aktivInAlamida).length;
  return { heute, abholung, imKr, aktiv, offen: offene.length };
}
