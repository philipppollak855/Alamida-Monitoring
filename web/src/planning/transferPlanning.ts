import type { Sterbefall } from '../types';
import type { DispositionSettings } from '../types/dispositionSettings';
import { getEffectiveAusstehend, schrittZielIstEigeneKr } from '../board/ausstehendEffective';
import { resolveAusstehendStatus } from '../board/ausstehendStatus';
import { dayKeyFromDeDatum } from '../board/dateUtils';
import { isImEigenenKuehlraum } from '../board/kuehlraumLogic';
import { resolveFallKuehlraumIdOrPrimary } from '../board/kuehlraumZuordnung';
import { belegeKuehlraumSlots } from '../board/kuehlplatzSlots';
import { isUeberfuehrungZeileErledigt } from '../board/ueberfuehrungErledigt';
import { matchEigenerKuehlraum } from '../settings/ortMatchers';
import { parseUeberfuehrungRoute } from '../board/routeParse';
import type {
  KuehlraumDayCapacity,
  PlanAssignment,
  PlanningCard,
} from './types';

export function planningCardId(docId: string, zeile: number): string {
  return `${docId}:${zeile}`;
}

function nachOrtAusSchritt(vonOrt?: string, nachOrt?: string): string | undefined {
  const nach = nachOrt?.trim();
  if (nach) return nach;
  return parseUeberfuehrungRoute(vonOrt ?? '').nach?.trim() || undefined;
}

function schrittStartIstEigeneKr(a: { vonOrt?: string; nachOrt?: string }): boolean {
  if (matchEigenerKuehlraum(a.vonOrt)) return true;
  const route = parseUeberfuehrungRoute(a.vonOrt ?? '');
  return !!matchEigenerKuehlraum(route.von ?? undefined);
}

/** Offene Überführungen als Planungskarten (ohne vergangene). */
export function buildPlanningCards(
  sterbefaelle: Sterbefall[],
  assignments: Record<string, PlanAssignment>,
  settings: DispositionSettings
): PlanningCard[] {
  const cards: PlanningCard[] = [];

  for (const s of sterbefaelle) {
    const sterbefallId = s.sterbefallId ?? s.id;
    const name = s.verstorbenerName ?? sterbefallId;
    let zeilenFallback = 0;

    for (const a of getEffectiveAusstehend(s)) {
      zeilenFallback += 1;
      const zeile = a.zeile ?? zeilenFallback;
      const terminAm = a.terminAm ?? a.abholungAm ?? 'ohne Datum';
      const status = resolveAusstehendStatus(terminAm, a.status ?? 'geplant');
      if (status === 'vergangen') continue;

      const id = planningCardId(s.id, zeile);
      const assignment = assignments[id];
      const sourceDayKey = dayKeyFromDeDatum(terminAm);
      const nachOrt = nachOrtAusSchritt(a.vonOrt, a.nachOrt) ?? a.nachOrt ?? '—';
      const vonOrt = a.vonOrt?.trim() || '—';
      const targetsEigenerKr = schrittZielIstEigeneKr({ vonOrt: a.vonOrt, nachOrt });
      const leavesEigenerKr = schrittStartIstEigeneKr({ vonOrt: a.vonOrt, nachOrt });

      let kuehlraumId: string | null =
        assignment?.plannedKuehlraumId?.trim() ||
        matchEigenerKuehlraum(nachOrt, settings)?.id ||
        matchEigenerKuehlraum(vonOrt, settings)?.id ||
        null;

      if (!kuehlraumId && (targetsEigenerKr || leavesEigenerKr || isImEigenenKuehlraum(s))) {
        kuehlraumId = resolveFallKuehlraumIdOrPrimary(s, settings) ?? null;
      }

      const plannedDayKey =
        assignment?.plannedDayKey !== undefined
          ? assignment.plannedDayKey
          : sourceDayKey;

      cards.push({
        id,
        docId: s.id,
        zeile,
        sterbefallId,
        name,
        schrittTyp: a.schrittTyp ?? 'ueberfuehrung',
        vonOrt,
        nachOrt,
        terminAm,
        sourceDayKey,
        plannedDayKey,
        status,
        erledigt: isUeberfuehrungZeileErledigt(s, zeile),
        istAbholungVomSterbeort: a.istAbholungVomSterbeort,
        targetsEigenerKr,
        leavesEigenerKr,
        kuehlraumId,
        order: assignment?.order ?? zeile,
        hasManualPlan: assignment != null,
      });
    }
  }

  return cards.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.name.localeCompare(b.name, 'de');
  });
}

export function cardsForLane(cards: PlanningCard[], dayKey: string | null): PlanningCard[] {
  return cards.filter((c) => c.plannedDayKey === dayKey);
}

/**
 * Prognostiziert Kühlraum-Kapazität über mehrere Tage.
 * Start: aktuelle physische Belegung. Pro Tag: +Ankünfte / −Abgänge aus Planungskarten.
 */
export function buildKuehlraumCapacities(
  sterbefaelle: Sterbefall[],
  cards: PlanningCard[],
  settings: DispositionSettings,
  dayKeys: string[]
): KuehlraumDayCapacity[] {
  const result: KuehlraumDayCapacity[] = [];

  for (const cfg of settings.eigeneKuehlraeume) {
    const slots = belegeKuehlraumSlots(sterbefaelle, cfg);
    let running = slots.filter(Boolean).length;
    const baseOccupied = running;

    for (const dayKey of dayKeys) {
      const dayCards = cards.filter(
        (c) => c.plannedDayKey === dayKey && c.kuehlraumId === cfg.id && !c.erledigt
      );
      const arrivals = dayCards.filter((c) => c.targetsEigenerKr).length;
      const departures = dayCards.filter((c) => c.leavesEigenerKr && !c.targetsEigenerKr).length;

      running = Math.max(0, running + arrivals - departures);
      const free = cfg.plaetze - running;

      result.push({
        dayKey,
        kuehlraumId: cfg.id,
        label: cfg.label,
        plaetze: cfg.plaetze,
        baseOccupied,
        projectedOccupied: running,
        arrivals,
        departures,
        free,
        overbooked: running > cfg.plaetze,
      });
    }
  }

  return result;
}

export function moveCardAssignment(
  assignments: Record<string, PlanAssignment>,
  card: PlanningCard,
  toDayKey: string | null,
  order: number
): Record<string, PlanAssignment> {
  const next = { ...assignments };
  next[card.id] = {
    id: card.id,
    docId: card.docId,
    zeile: card.zeile,
    plannedDayKey: toDayKey,
    plannedKuehlraumId: card.kuehlraumId,
    order,
    updatedAtMs: Date.now(),
  };
  return next;
}

/** Nächste order in einer Lane (Ende anhängen). */
export function nextOrderInLane(cards: PlanningCard[], dayKey: string | null): number {
  const lane = cardsForLane(cards, dayKey);
  if (lane.length === 0) return 10;
  return Math.max(...lane.map((c) => c.order)) + 10;
}
