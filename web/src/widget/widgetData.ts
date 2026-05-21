import type { Sterbefall } from '../types';
import { filterAktiveSterbefaelle } from '../board/historieLogic';
import {
  boardStats,
  buildPrimaerKuehlraumSlots,
  flattenOffene,
} from '../board/boardUtils';
import { buildExternGruppen, externGesamt } from '../board/wallExternUtils';

export type WidgetKind = 'summary' | 'kuehlraum' | 'extern' | 'heute';

export function parseWidgetKind(raw?: string): WidgetKind {
  if (raw === 'kuehlraum' || raw === 'extern' || raw === 'heute' || raw === 'summary') {
    return raw;
  }
  return 'summary';
}

export function buildWidgetSnapshot(sterbefaelleRaw: Sterbefall[]) {
  const sterbefaelle = filterAktiveSterbefaelle(sterbefaelleRaw);
  const offene = flattenOffene(sterbefaelle);
  const stats = boardStats(sterbefaelle, offene);
  const { cfg, slots } = buildPrimaerKuehlraumSlots(sterbefaelle);
  const externGruppen = buildExternGruppen(sterbefaelle);
  const heute = offene.filter((o) => o.status === 'heute').slice(0, 6);

  const badgeCount = stats.heute + externGesamt(externGruppen);

  return {
    stats,
    cfg,
    slots,
    belegt: slots.filter(Boolean).length,
    externGruppen,
    externTotal: externGesamt(externGruppen),
    heute,
    badgeCount,
  };
}
