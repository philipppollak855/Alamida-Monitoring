import type { Sterbefall, OffeneUeberfuehrungRow } from '../types';
import type { EigenerKuehlraumConfig } from '../types/dispositionSettings';
import { getPrimaererKuehlraum } from '../settings/dispositionSettingsStore';
import { resolveFallKuehlraumId } from './kuehlraumZuordnung';
import { resolveAusstehendStatus } from './ausstehendStatus';
import { isUeberfuehrungZeileErledigt } from './ueberfuehrungErledigt';
import { parseDatumDe } from './dateUtils';
import { isImEigenenKuehlraum } from './kuehlraumLogic';

export { parseDatumDe } from './dateUtils';

export function flattenOffene(sterbefaelle: Sterbefall[]): OffeneUeberfuehrungRow[] {
  const rows: OffeneUeberfuehrungRow[] = [];
  for (const s of sterbefaelle) {
    const id = s.sterbefallId ?? s.id;
    const name = s.verstorbenerName ?? id;
    let zeilenFallback = 0;
    for (const a of s.ausstehend ?? []) {
      zeilenFallback += 1;
      const zeile = a.zeile ?? zeilenFallback;
      const terminAm = a.terminAm ?? a.abholungAm ?? 'ohne Datum';
      const status = resolveAusstehendStatus(terminAm, a.status ?? 'geplant');
      if (status === 'vergangen') continue;

      rows.push({
        docId: s.id,
        zeile,
        erledigt: isUeberfuehrungZeileErledigt(s, zeile),
        sterbefallId: id,
        name,
        schrittTyp: a.schrittTyp ?? 'ueberfuehrung',
        vonOrt: a.vonOrt ?? '—',
        nachOrt: a.nachOrt ?? '—',
        terminAm,
        status,
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
    if (resolveFallKuehlraumId(s) !== cfg.id) continue;
    const platz = parseInt(s.kuehlplatz ?? '', 10);
    const idx =
      platz >= 1 && platz <= cfg.plaetze ? platz - 1 : slots.findIndex((x) => x === null);
    if (idx >= 0 && idx < cfg.plaetze && slots[idx] === null) slots[idx] = s;
  }
  return { cfg, slots };
}

/** @deprecated Alias */
export const buildGrafenbachSlots = buildPrimaerKuehlraumSlots;

export type KuehlraumSlotGrid = {
  cfg: EigenerKuehlraumConfig;
  slots: (Sterbefall | null)[];
};

export function buildAlleEigeneKuehlraumSlots(
  sterbefaelle: Sterbefall[],
  kuehlraeume: EigenerKuehlraumConfig[]
): KuehlraumSlotGrid[] {
  return kuehlraeume.map((cfg) => {
    const slots: (Sterbefall | null)[] = Array(cfg.plaetze).fill(null);
    for (const s of sterbefaelle) {
      if (!isImEigenenKuehlraum(s)) continue;
      if (resolveFallKuehlraumId(s) !== cfg.id) continue;
      const platz = parseInt(s.kuehlplatz ?? '', 10);
      const idx =
        platz >= 1 && platz <= cfg.plaetze ? platz - 1 : slots.findIndex((x) => x === null);
      if (idx >= 0 && idx < cfg.plaetze && slots[idx] === null) slots[idx] = s;
    }
    return { cfg, slots };
  });
}

export function kuehlraumGesamtBelegung(grids: KuehlraumSlotGrid[]) {
  const belegt = grids.reduce((sum, g) => sum + g.slots.filter(Boolean).length, 0);
  const plaetze = grids.reduce((sum, g) => sum + g.cfg.plaetze, 0);
  return { belegt, plaetze };
}

export function boardStats(sterbefaelle: Sterbefall[], offene: OffeneUeberfuehrungRow[]) {
  const heute = offene.filter((o) => o.status === 'heute').length;
  const abholung = offene.filter((o) => o.istAbholungVomSterbeort || o.status === 'abholung_noetig').length;
  const imKr = sterbefaelle.filter((s) => isImEigenenKuehlraum(s)).length;
  const aktiv = sterbefaelle.filter((s) => s.aktivInAlamida).length;
  return { heute, abholung, imKr, aktiv, offen: offene.length };
}
