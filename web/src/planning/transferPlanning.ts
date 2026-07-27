import type { Sterbefall } from '../types';
import type { DispositionSettings, EigenerKuehlraumConfig } from '../types/dispositionSettings';
import { getEffectiveAusstehend, schrittZielIstEigeneKr } from '../board/ausstehendEffective';
import { resolveAusstehendStatus } from '../board/ausstehendStatus';
import { dayKeyFromDeDatum, dayKeyFromDate, parseDatumDeToDate } from '../board/dateUtils';
import {
  isAmKrankenhausOderSterbeort,
  isImEigenenKuehlraum,
} from '../board/kuehlraumLogic';
import { resolveFallKuehlraumIdOrPrimary } from '../board/kuehlraumZuordnung';
import { belegeKuehlraumSlots } from '../board/kuehlplatzSlots';
import { isUeberfuehrungZeileErledigt } from '../board/ueberfuehrungErledigt';
import { matchEigenerKuehlraum } from '../settings/ortMatchers';
import { parseUeberfuehrungRoute } from '../board/routeParse';
import type {
  DispositionPlanEvent,
  KuehlraumDayCapacity,
  PlanAssignment,
  PlanningCard,
  ScheduleDraft,
  SterbeortPoolItem,
} from './types';

export function planningCardId(docId: string, zeile: number): string {
  return `${docId}:${zeile}`;
}

export function canvasPlanningId(docId: string, kuehlraumId: string): string {
  return `${docId}:canvas:${kuehlraumId}`;
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

export function formatDeDatumFromDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split('-');
  return `${d}.${m}.${y}`;
}

export function formatTerminDisplay(dayKey: string | null, zeit?: string | null, fallback = 'ohne Datum'): string {
  if (!dayKey) return fallback;
  const date = formatDeDatumFromDayKey(dayKey);
  const t = zeit?.trim();
  return t ? `${date} ${t}` : date;
}

function resolveNachOrtLabel(
  kuehlraumId: string | null | undefined,
  settings: DispositionSettings,
  fallback?: string
): string {
  if (kuehlraumId) {
    const cfg = settings.eigeneKuehlraeume.find((k) => k.id === kuehlraumId);
    if (cfg) return cfg.alamidaName?.trim() || cfg.label;
  }
  return fallback?.trim() || '—';
}

function cardFromAssignment(
  s: Sterbefall,
  assignment: PlanAssignment,
  settings: DispositionSettings
): PlanningCard {
  const sterbefallId = s.sterbefallId ?? s.id;
  const name = s.verstorbenerName ?? sterbefallId;
  const kuehlraumId = assignment.plannedKuehlraumId?.trim() || null;
  const nachOrt =
    assignment.nachOrt?.trim() ||
    resolveNachOrtLabel(kuehlraumId, settings);
  const vonOrt =
    assignment.vonOrt?.trim() ||
    s.aktuellePosition?.trim() ||
    s.abholort?.trim() ||
    s.sterbeort?.trim() ||
    '—';
  const terminAm = formatTerminDisplay(
    assignment.plannedDayKey,
    assignment.plannedZeit,
    'ohne Datum'
  );

  return {
    id: assignment.id,
    docId: s.id,
    zeile: assignment.zeile,
    sterbefallId,
    name,
    schrittTyp: assignment.schrittTyp?.trim() || 'abholung',
    vonOrt,
    nachOrt,
    terminAm,
    plannedZeit: assignment.plannedZeit ?? null,
    sourceDayKey: null,
    plannedDayKey: assignment.plannedDayKey,
    status: assignment.plannedDayKey
      ? resolveAusstehendStatus(terminAm, 'geplant')
      : 'geplant',
    erledigt: false,
    istAbholungVomSterbeort: true,
    targetsEigenerKr: true,
    leavesEigenerKr: false,
    kuehlraumId,
    order: assignment.order,
    hasManualPlan: true,
    source: 'canvas',
    amSterbeort: isAmKrankenhausOderSterbeort(s),
  };
}

/** Offene Überführungen als Planungskarten (ohne vergangene), inkl. Canvas-Planungen. */
export function buildPlanningCards(
  sterbefaelle: Sterbefall[],
  assignments: Record<string, PlanAssignment>,
  settings: DispositionSettings
): PlanningCard[] {
  const cards: PlanningCard[] = [];
  const covered = new Set<string>();
  const byId = new Map(sterbefaelle.map((s) => [s.id, s]));

  for (const s of sterbefaelle) {
    const sterbefallId = s.sterbefallId ?? s.id;
    const name = s.verstorbenerName ?? sterbefallId;
    let zeilenFallback = 0;

    for (const a of getEffectiveAusstehend(s)) {
      zeilenFallback += 1;
      const zeile = a.zeile ?? zeilenFallback;
      const terminAmRaw = a.terminAm ?? a.abholungAm ?? 'ohne Datum';
      const status = resolveAusstehendStatus(terminAmRaw, a.status ?? 'geplant');
      if (status === 'vergangen') continue;

      const id = planningCardId(s.id, zeile);
      covered.add(id);
      const assignment = assignments[id];
      const sourceDayKey = dayKeyFromDeDatum(terminAmRaw);
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

      const terminAm = assignment?.plannedZeit
        ? formatTerminDisplay(plannedDayKey, assignment.plannedZeit, terminAmRaw)
        : assignment?.plannedDayKey
          ? formatTerminDisplay(assignment.plannedDayKey, null, terminAmRaw)
          : terminAmRaw;

      cards.push({
        id,
        docId: s.id,
        zeile,
        sterbefallId,
        name,
        schrittTyp: a.schrittTyp ?? 'ueberfuehrung',
        vonOrt: assignment?.vonOrt?.trim() || vonOrt,
        nachOrt: assignment?.nachOrt?.trim() || nachOrt,
        terminAm,
        plannedZeit: assignment?.plannedZeit ?? null,
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
        source: assignment?.source === 'canvas' ? 'canvas' : 'alamida',
        amSterbeort: isAmKrankenhausOderSterbeort(s),
      });
    }
  }

  for (const assignment of Object.values(assignments)) {
    if (assignment.source !== 'canvas') continue;
    if (covered.has(assignment.id)) continue;
    const s = byId.get(assignment.docId);
    if (!s) continue;
    cards.push(cardFromAssignment(s, assignment, settings));
  }

  return cards.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    const ta = a.plannedZeit ?? '';
    const tb = b.plannedZeit ?? '';
    if (ta !== tb) return ta.localeCompare(tb);
    return a.name.localeCompare(b.name, 'de');
  });
}

/**
 * Fälle am Sterbeort/KH, die noch keine terminierte KR-Überführung im Plan haben.
 */
export function buildSterbeortPool(
  sterbefaelle: Sterbefall[],
  cards: PlanningCard[],
  settings: DispositionSettings
): SterbeortPoolItem[] {
  const scheduledDocIds = new Set(
    cards
      .filter((c) => c.targetsEigenerKr && c.plannedDayKey != null && !c.erledigt)
      .map((c) => c.docId)
  );

  const items: SterbeortPoolItem[] = [];
  for (const s of sterbefaelle) {
    if (!isAmKrankenhausOderSterbeort(s)) continue;
    if (scheduledDocIds.has(s.id)) continue;

    const existing = cards.find((c) => c.docId === s.id && c.targetsEigenerKr && !c.erledigt);
    const vonOrt =
      s.aktuellePosition?.trim() ||
      existing?.vonOrt ||
      s.abholort?.trim() ||
      s.sterbeort?.trim() ||
      'Sterbeort';

    items.push({
      docId: s.id,
      sterbefallId: s.sterbefallId ?? s.id,
      name: s.verstorbenerName ?? s.sterbefallId ?? s.id,
      vonOrt,
      existingCardId: existing?.id,
      suggestedKuehlraumId:
        existing?.kuehlraumId ??
        resolveFallKuehlraumIdOrPrimary(s, settings) ??
        settings.eigeneKuehlraeume[0]?.id ??
        null,
    });
  }

  return items.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

export function cardsForLane(cards: PlanningCard[], dayKey: string | null): PlanningCard[] {
  return cards.filter((c) => c.plannedDayKey === dayKey);
}

export function cardsForKuehlraumLane(
  cards: PlanningCard[],
  dayKey: string,
  kuehlraumId: string
): PlanningCard[] {
  return cards.filter(
    (c) =>
      c.plannedDayKey === dayKey &&
      c.kuehlraumId === kuehlraumId &&
      c.targetsEigenerKr &&
      !c.erledigt
  );
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
  order: number,
  extras?: Partial<PlanAssignment>
): Record<string, PlanAssignment> {
  const next = { ...assignments };
  next[card.id] = {
    id: card.id,
    docId: card.docId,
    zeile: card.zeile,
    plannedDayKey: toDayKey,
    plannedKuehlraumId: extras?.plannedKuehlraumId ?? card.kuehlraumId,
    plannedZeit: extras?.plannedZeit ?? card.plannedZeit ?? null,
    vonOrt: extras?.vonOrt ?? card.vonOrt,
    nachOrt: extras?.nachOrt ?? card.nachOrt,
    schrittTyp: extras?.schrittTyp ?? card.schrittTyp,
    source: extras?.source ?? card.source,
    order,
    updatedAtMs: Date.now(),
  };
  return next;
}

export function scheduleToKuehlraum(
  assignments: Record<string, PlanAssignment>,
  draft: ScheduleDraft,
  order: number,
  existingCard?: PlanningCard | null
): { assignments: Record<string, PlanAssignment>; assignment: PlanAssignment; eventType: DispositionPlanEvent['type'] } {
  const id =
    existingCard?.id ??
    (draft.existingZeile != null
      ? planningCardId(draft.docId, draft.existingZeile)
      : canvasPlanningId(draft.docId, draft.kuehlraumId));

  const prev = assignments[id];
  const assignment: PlanAssignment = {
    id,
    docId: draft.docId,
    zeile: existingCard?.zeile ?? draft.existingZeile ?? -1,
    plannedDayKey: draft.dayKey,
    plannedKuehlraumId: draft.kuehlraumId,
    plannedZeit: draft.zeit || null,
    vonOrt: draft.vonOrt,
    nachOrt: draft.nachOrt,
    schrittTyp: draft.schrittTyp,
    source: existingCard?.source === 'alamida' ? 'alamida' : 'canvas',
    order,
    updatedAtMs: Date.now(),
  };

  return {
    assignments: { ...assignments, [id]: assignment },
    assignment,
    eventType: prev ? 'ueberfuehrung_umgeplant' : 'ueberfuehrung_geplant',
  };
}

export function removeAssignment(
  assignments: Record<string, PlanAssignment>,
  id: string
): Record<string, PlanAssignment> {
  const next = { ...assignments };
  delete next[id];
  return next;
}

/** Nächste order in einer Lane (Ende anhängen). */
export function nextOrderInLane(cards: PlanningCard[], dayKey: string | null): number {
  const lane = cardsForLane(cards, dayKey);
  if (lane.length === 0) return 10;
  return Math.max(...lane.map((c) => c.order)) + 10;
}

export function buildScheduleDraftFromSterbeort(opts: {
  item: SterbeortPoolItem;
  dayKey: string;
  kuehlraum: EigenerKuehlraumConfig;
  existingCard?: PlanningCard | null;
  defaultZeit?: string;
}): ScheduleDraft {
  const { item, dayKey, kuehlraum, existingCard, defaultZeit = '10:00' } = opts;
  return {
    docId: item.docId,
    cardId: existingCard?.id ?? item.existingCardId,
    name: item.name,
    vonOrt: existingCard?.vonOrt ?? item.vonOrt,
    nachOrt: kuehlraum.alamidaName?.trim() || kuehlraum.label,
    kuehlraumId: kuehlraum.id,
    kuehlraumLabel: kuehlraum.label,
    dayKey,
    zeit: existingCard?.plannedZeit || defaultZeit,
    schrittTyp: existingCard?.schrittTyp || 'abholung',
    existingZeile: existingCard && existingCard.zeile > 0 ? existingCard.zeile : undefined,
  };
}

export function buildScheduleDraftFromCard(opts: {
  card: PlanningCard;
  dayKey: string;
  kuehlraum: EigenerKuehlraumConfig;
  defaultZeit?: string;
}): ScheduleDraft {
  const { card, dayKey, kuehlraum, defaultZeit = '10:00' } = opts;
  return {
    docId: card.docId,
    cardId: card.id,
    name: card.name,
    vonOrt: card.vonOrt,
    nachOrt: kuehlraum.alamidaName?.trim() || kuehlraum.label,
    kuehlraumId: kuehlraum.id,
    kuehlraumLabel: kuehlraum.label,
    dayKey,
    zeit: card.plannedZeit || defaultZeit,
    schrittTyp: card.schrittTyp || 'abholung',
    existingZeile: card.zeile > 0 ? card.zeile : undefined,
  };
}

export function dayKeyFromIsoDateInput(value: string): string | null {
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function isoDateInputFromDayKey(dayKey: string): string {
  return dayKey;
}

export function defaultZeitNowRounded(): string {
  const d = new Date();
  const minutes = d.getMinutes() < 30 ? 0 : 30;
  d.setMinutes(minutes, 0, 0);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function parseDayKeySafe(dayKey: string): Date | null {
  const d = parseDatumDeToDate(formatDeDatumFromDayKey(dayKey));
  return d;
}

export function todayDayKey(now = new Date()): string {
  return dayKeyFromDate(now);
}
