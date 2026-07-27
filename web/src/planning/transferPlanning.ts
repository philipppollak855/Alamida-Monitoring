import type { Sterbefall } from '../types';
import type { DispositionSettings, EigenerKuehlraumConfig } from '../types/dispositionSettings';
import { getEffectiveAusstehend, schrittZielIstEigeneKr } from '../board/ausstehendEffective';
import { resolveAusstehendStatus } from '../board/ausstehendStatus';
import {
  dayKeyFromDeDatum,
  dayKeyFromDate,
  extractZeitDe,
} from '../board/dateUtils';
import { istFreigabeWirksam, tageSeitFreigabe } from '../board/freigabeLogic';
import {
  isAmKrankenhausOderSterbeort,
  isImEigenenKuehlraum,
} from '../board/kuehlraumLogic';
import { buildKuehlraumTerminMarkers } from '../board/kuehlraumTerminMarker';
import { resolveFallKuehlraumId, resolveFallKuehlraumIdOrPrimary } from '../board/kuehlraumZuordnung';
import { belegeKuehlraumSlots, resolveSlotKuehlraumId } from '../board/kuehlplatzSlots';
import { isUeberfuehrungZeileErledigt } from '../board/ueberfuehrungErledigt';
import { matchEigenerKuehlraum } from '../settings/ortMatchers';
import { parseUeberfuehrungRoute } from '../board/routeParse';
import type {
  AttachedCeremonyRef,
  CeremonyInfo,
  CeremonyKind,
  DispositionPlanEvent,
  FreigabeState,
  KuehlraumDayCapacity,
  KuehlraumOccupant,
  KuehlraumRailState,
  LocationGroup,
  PlanAssignment,
  PlanAssignmentSnapshot,
  PlanningCard,
  ScheduleDraft,
  SlotFreeEvent,
  SterbeortPoolItem,
} from './types';

export function planningCardId(docId: string, zeile: number): string {
  return `${docId}:${zeile}`;
}

export function canvasPlanningId(docId: string, kuehlraumId: string): string {
  return `${docId}:canvas:${kuehlraumId}`;
}

export function snapshotFromAssignment(a: PlanAssignment): PlanAssignmentSnapshot {
  return {
    plannedDayKey: a.plannedDayKey,
    plannedKuehlraumId: a.plannedKuehlraumId ?? null,
    plannedZeit: a.plannedZeit ?? null,
    vonOrt: a.vonOrt ?? null,
    nachOrt: a.nachOrt ?? null,
    schrittTyp: a.schrittTyp ?? null,
    order: a.order,
    attachedCeremony: a.attachedCeremony ?? null,
  };
}

export function assignmentSnapshotPayload(
  a: PlanAssignment
): PlanAssignmentSnapshot & { zeile: number; source?: 'alamida' | 'canvas' } {
  return {
    ...snapshotFromAssignment(a),
    zeile: a.zeile,
    source: a.source,
  };
}

/** Ob ein weitergegebenes Event rückgängig gemacht werden kann. */
export function canUndoPlanEvent(
  event: DispositionPlanEvent,
  assignments: Record<string, PlanAssignment>
): boolean {
  if (event.type === 'ueberfuehrung_entfernt') {
    return Boolean(event.assignmentId && (event.snapshot || event.previousSnapshot));
  }
  if (event.type === 'ueberfuehrung_umgeplant') {
    if (event.previousSnapshot && event.assignmentId) return true;
    const id = event.assignmentId;
    // Auch „zurück zum Abholort“ (plannedDayKey null) ist umkehrbar
    if (id && event.previousSnapshot) return true;
    return Boolean(id && assignments[id]?.previous);
  }
  // geplant → Zuordnung entfernen / Abholort
  return Boolean(event.assignmentId && assignments[event.assignmentId]);
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

export function formatTerminDisplay(
  dayKey: string | null,
  zeit?: string | null,
  fallback = 'ohne Datum'
): string {
  if (!dayKey) return fallback;
  const date = formatDeDatumFromDayKey(dayKey);
  const t = zeit?.trim();
  return t ? `${date} ${t}` : date;
}

export function resolveFreigabeState(
  s: Pick<Sterbefall, 'freigabeFrei' | 'freigabeDatum'>,
  now = new Date()
): FreigabeState {
  if (!s.freigabeFrei) return 'offen';
  return istFreigabeWirksam(s.freigabeFrei, s.freigabeDatum, now) ? 'frei' : 'geplant';
}

export function freigabeLabel(state: FreigabeState, datum?: string): string {
  if (state === 'offen') return 'Freigabe offen';
  if (state === 'geplant') return datum ? `Freigabe ab ${datum}` : 'Freigabe geplant';
  return datum ? `Frei ${datum}` : 'Freigabe da';
}

export function buildCeremoniesForFall(s: Sterbefall, now = new Date()): CeremonyInfo[] {
  return buildKuehlraumTerminMarkers(s, now).map((m) => ({
    kind: m.kind,
    datum: m.datum,
    dayKey: dayKeyFromDeDatum(m.datum),
    zeit: m.zeit || extractZeitDe(m.datum) || undefined,
    ort: m.ort,
    label: m.label,
    relativeLabel: m.relativeLabel,
    bestattungsMarker: m.bestattungsMarker,
  }));
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

function enrichCardMeta(s: Sterbefall, now: Date): Pick<
  PlanningCard,
  'freigabeState' | 'freigabeDatum' | 'ceremonies' | 'endzielTyp' | 'endziel'
> {
  return {
    freigabeState: resolveFreigabeState(s, now),
    freigabeDatum: s.freigabeDatum,
    ceremonies: buildCeremoniesForFall(s, now),
    endzielTyp: s.endzielTyp,
    endziel: s.endziel,
  };
}

function cardFromAssignment(
  s: Sterbefall,
  assignment: PlanAssignment,
  settings: DispositionSettings,
  now: Date
): PlanningCard {
  const sterbefallId = s.sterbefallId ?? s.id;
  const name = s.verstorbenerName ?? sterbefallId;
  const kuehlraumId = assignment.plannedKuehlraumId?.trim() || null;
  const nachOrt =
    assignment.nachOrt?.trim() || resolveNachOrtLabel(kuehlraumId, settings);
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
    canUndoUmplanung: Boolean(assignment.previous),
    attachedCeremony: assignment.attachedCeremony ?? null,
    source: 'canvas',
    amSterbeort: isAmKrankenhausOderSterbeort(s),
    ...enrichCardMeta(s, now),
  };
}

/** Offene Überführungen als Planungskarten (ohne vergangene), inkl. Canvas-Planungen. */
export function buildPlanningCards(
  sterbefaelle: Sterbefall[],
  assignments: Record<string, PlanAssignment>,
  settings: DispositionSettings,
  now = new Date()
): PlanningCard[] {
  const cards: PlanningCard[] = [];
  const covered = new Set<string>();
  const byId = new Map(sterbefaelle.map((s) => [s.id, s]));

  for (const s of sterbefaelle) {
    const sterbefallId = s.sterbefallId ?? s.id;
    const name = s.verstorbenerName ?? sterbefallId;
    let zeilenFallback = 0;
    const meta = enrichCardMeta(s, now);

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
        canUndoUmplanung: Boolean(assignment?.previous),
        attachedCeremony: assignment?.attachedCeremony ?? null,
        source: assignment?.source === 'canvas' ? 'canvas' : 'alamida',
        amSterbeort: isAmKrankenhausOderSterbeort(s),
        ...meta,
      });
    }
  }

  for (const assignment of Object.values(assignments)) {
    if (assignment.source !== 'canvas') continue;
    if (covered.has(assignment.id)) continue;
    const s = byId.get(assignment.docId);
    if (!s) continue;
    cards.push(cardFromAssignment(s, assignment, settings, now));
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
 * Wann wird ein Platz im eigenen KR wieder frei?
 * — Abgang (Kremation/Weiterführung) oder Beisetzung.
 */
export function buildSlotFreeEvents(
  sterbefaelle: Sterbefall[],
  cards: PlanningCard[],
  settings: DispositionSettings,
  now = new Date()
): SlotFreeEvent[] {
  const events: SlotFreeEvent[] = [];

  for (const card of cards) {
    if (card.erledigt || !card.plannedDayKey) continue;
    if (!(card.leavesEigenerKr && !card.targetsEigenerKr)) continue;
    const reason: SlotFreeEvent['reason'] =
      card.schrittTyp === 'kremation' ? 'kremation' : 'ueberfuehrung';
    events.push({
      docId: card.docId,
      name: card.name,
      dayKey: card.plannedDayKey,
      zeit: card.plannedZeit,
      reason,
      vonOrt: card.vonOrt,
      nachOrt: card.nachOrt,
    });
  }

  for (const s of sterbefaelle) {
    if (!isImEigenenKuehlraum(s)) continue;
    const ceremonies = buildCeremoniesForFall(s, now);
    const beisetzung = ceremonies.find((c) => c.kind === 'beisetzung' && c.dayKey);
    if (!beisetzung?.dayKey) continue;
    const already = events.some(
      (e) => e.docId === s.id && e.dayKey === beisetzung.dayKey && e.reason === 'beisetzung'
    );
    if (already) continue;
    const krId = resolveFallKuehlraumId(s, settings);
    const kr = settings.eigeneKuehlraeume.find((k) => k.id === krId);
    events.push({
      docId: s.id,
      name: s.verstorbenerName ?? s.sterbefallId ?? s.id,
      dayKey: beisetzung.dayKey,
      zeit: beisetzung.zeit ?? null,
      reason: 'beisetzung',
      vonOrt: kr?.alamidaName || kr?.label || 'Kühlraum',
      nachOrt: s.endziel?.trim() || 'Beisetzung',
    });
  }

  return events.sort((a, b) => {
    if (a.dayKey !== b.dayKey) return a.dayKey.localeCompare(b.dayKey);
    return (a.zeit ?? '').localeCompare(b.zeit ?? '');
  });
}

export function buildSterbeortPool(
  sterbefaelle: Sterbefall[],
  cards: PlanningCard[],
  settings: DispositionSettings,
  now = new Date()
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
    const ceremonies = buildCeremoniesForFall(s, now);

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
      freigabeState: resolveFreigabeState(s, now),
      freigabeDatum: s.freigabeDatum,
      tageSeitFreigabe: tageSeitFreigabe(s.freigabeFrei, s.freigabeDatum, now),
      nextCeremony: ceremonies[0],
      endzielTyp: s.endzielTyp,
      endziel: s.endziel,
    });
  }

  return items.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

export function buildLocationGroups(pool: SterbeortPoolItem[]): LocationGroup[] {
  const map = new Map<string, LocationGroup>();
  for (const item of pool) {
    const label = item.vonOrt.trim() || 'Unbekannter Ort';
    const key = label.toLowerCase();
    const existing = map.get(key);
    if (existing) existing.items.push(item);
    else map.set(key, { key, label, items: [item] });
  }
  return [...map.values()]
    .map((g) => ({
      ...g,
      items: [...g.items].sort((a, b) => a.name.localeCompare(b.name, 'de')),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'de'));
}

export function buildKuehlraumRailStates(
  sterbefaelle: Sterbefall[],
  cards: PlanningCard[],
  settings: DispositionSettings,
  focusDayKey?: string | null,
  now = new Date()
): KuehlraumRailState[] {
  const slotFrees = buildSlotFreeEvents(sterbefaelle, cards, settings, now);

  return settings.eigeneKuehlraeume.map((cfg) => {
    const slots = belegeKuehlraumSlots(sterbefaelle, cfg);
    const occupants: KuehlraumOccupant[] = [];

    slots.forEach((fall, idx) => {
      if (!fall) return;
      const ceremonies = buildCeremoniesForFall(fall, now);
      const freeEv = slotFrees.find((e) => e.docId === fall.id);
      occupants.push({
        docId: fall.id,
        name: fall.verstorbenerName ?? fall.sterbefallId ?? fall.id,
        sterbefallId: fall.sterbefallId ?? fall.id,
        platz: fall.kuehlplatzDisposition || fall.kuehlplatz || String(idx + 1),
        freigabeState: resolveFreigabeState(fall, now),
        freigabeDatum: fall.freigabeDatum,
        tageSeitFreigabe: tageSeitFreigabe(fall.freigabeFrei, fall.freigabeDatum, now),
        nextCeremony: ceremonies[0],
        freesOnDayKey: freeEv?.dayKey ?? null,
        freesReason: freeEv?.reason,
      });
    });

    const plannedArrivals = cards.filter(
      (c) =>
        c.targetsEigenerKr &&
        !c.erledigt &&
        c.kuehlraumId === cfg.id &&
        (focusDayKey ? c.plannedDayKey === focusDayKey : c.plannedDayKey != null)
    ).length;

    const plannedDepartures = slotFrees.filter((e) => {
      if (focusDayKey && e.dayKey !== focusDayKey) return false;
      const fall = sterbefaelle.find((s) => s.id === e.docId);
      if (!fall) return false;
      return resolveSlotKuehlraumId(fall) === cfg.id || resolveFallKuehlraumId(fall, settings) === cfg.id;
    }).length;

    const occupiedNow = occupants.length;
    const projected = Math.max(0, occupiedNow + plannedArrivals - plannedDepartures);

    return {
      id: cfg.id,
      label: cfg.label,
      alamidaName: cfg.alamidaName,
      plaetze: cfg.plaetze,
      occupiedNow,
      plannedArrivals,
      plannedDepartures,
      free: cfg.plaetze - projected,
      overbooked: projected > cfg.plaetze,
      zeigeTageSeitFreigabe: cfg.zeigeTageSeitFreigabe === true,
      occupants,
      slotFrees: slotFrees.filter((e) => {
        const fall = sterbefaelle.find((s) => s.id === e.docId);
        if (!fall) return false;
        return (
          resolveSlotKuehlraumId(fall) === cfg.id ||
          resolveFallKuehlraumId(fall, settings) === cfg.id
        );
      }),
    };
  });
}

export function cardsForLane(cards: PlanningCard[], dayKey: string | null): PlanningCard[] {
  return cards.filter((c) => c.plannedDayKey === dayKey);
}

export function buildKuehlraumCapacities(
  sterbefaelle: Sterbefall[],
  cards: PlanningCard[],
  settings: DispositionSettings,
  dayKeys: string[],
  now = new Date()
): KuehlraumDayCapacity[] {
  const result: KuehlraumDayCapacity[] = [];
  const slotFrees = buildSlotFreeEvents(sterbefaelle, cards, settings, now);

  for (const cfg of settings.eigeneKuehlraeume) {
    const slots = belegeKuehlraumSlots(sterbefaelle, cfg);
    let running = slots.filter(Boolean).length;
    const baseOccupied = running;

    for (const dayKey of dayKeys) {
      const dayCards = cards.filter(
        (c) => c.plannedDayKey === dayKey && c.kuehlraumId === cfg.id && !c.erledigt
      );
      const arrivals = dayCards.filter((c) => c.targetsEigenerKr).length;
      const transferDeps = dayCards.filter(
        (c) => c.leavesEigenerKr && !c.targetsEigenerKr
      ).length;
      const beisetzungDeps = slotFrees.filter((e) => {
        if (e.dayKey !== dayKey || e.reason !== 'beisetzung') return false;
        const fall = sterbefaelle.find((s) => s.id === e.docId);
        if (!fall) return false;
        return (
          resolveSlotKuehlraumId(fall) === cfg.id ||
          resolveFallKuehlraumId(fall, settings) === cfg.id
        );
      }).length;
      const departures = transferDeps + beisetzungDeps;

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
  const prev = next[card.id];
  const attachedCeremony =
    extras && 'attachedCeremony' in extras
      ? extras.attachedCeremony ?? null
      : (prev?.attachedCeremony ?? card.attachedCeremony ?? null);
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
    previous: prev ? snapshotFromAssignment(prev) : null,
    attachedCeremony,
    updatedAtMs: Date.now(),
  };
  return next;
}

export function scheduleToKuehlraum(
  assignments: Record<string, PlanAssignment>,
  draft: ScheduleDraft,
  order: number,
  existingCard?: PlanningCard | null
): {
  assignments: Record<string, PlanAssignment>;
  assignment: PlanAssignment;
  eventType: 'ueberfuehrung_geplant' | 'ueberfuehrung_umgeplant';
} {
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
    previous: prev ? snapshotFromAssignment(prev) : null,
    attachedCeremony: prev?.attachedCeremony ?? existingCard?.attachedCeremony ?? null,
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

/**
 * Plant zurück zum Abholort / Ort-Pool:
 * plannedDayKey = null (überschreibt auch Alamida-Termindatum),
 * Fall erscheint wieder links bei den aktuellen Orten.
 */
export function clearCardToAbholort(
  assignments: Record<string, PlanAssignment>,
  card: PlanningCard
): {
  assignments: Record<string, PlanAssignment>;
  assignment: PlanAssignment;
  previous: PlanAssignment | null;
} {
  const prev = assignments[card.id] ?? null;
  const previousSnap = prev
    ? snapshotFromAssignment(prev)
    : card.plannedDayKey != null
      ? {
          plannedDayKey: card.plannedDayKey,
          plannedKuehlraumId: card.kuehlraumId,
          plannedZeit: card.plannedZeit ?? null,
          vonOrt: card.vonOrt,
          nachOrt: card.nachOrt,
          schrittTyp: card.schrittTyp,
          order: card.order,
          attachedCeremony: card.attachedCeremony ?? null,
        }
      : null;

  const assignment: PlanAssignment = {
    id: card.id,
    docId: card.docId,
    zeile: card.zeile,
    plannedDayKey: null,
    plannedKuehlraumId: card.kuehlraumId,
    plannedZeit: null,
    vonOrt: card.vonOrt,
    nachOrt: card.nachOrt,
    schrittTyp: card.schrittTyp,
    source: card.source,
    order: card.order,
    previous: previousSnap,
    attachedCeremony: null,
    updatedAtMs: Date.now(),
  };

  return {
    assignments: { ...assignments, [card.id]: assignment },
    assignment,
    previous: prev,
  };
}

/** Stellt die letzte Umplanung wieder her; ohne previous → zurück zum Abholort. */
export function undoOrRemoveAssignment(
  assignments: Record<string, PlanAssignment>,
  card: PlanningCard
): {
  assignments: Record<string, PlanAssignment>;
  mode: 'restored' | 'cleared';
  restored?: PlanAssignment;
  cleared?: PlanAssignment;
  previous?: PlanAssignment | null;
} {
  const current = assignments[card.id];
  if (current?.previous) {
    const restored: PlanAssignment = {
      id: current.id,
      docId: current.docId,
      zeile: current.zeile,
      source: current.source,
      ...current.previous,
      previous: null,
      updatedAtMs: Date.now(),
    };
    return {
      assignments: { ...assignments, [card.id]: restored },
      mode: 'restored',
      restored,
      previous: current,
    };
  }
  const cleared = clearCardToAbholort(assignments, card);
  return {
    assignments: cleared.assignments,
    mode: 'cleared',
    cleared: cleared.assignment,
    previous: cleared.previous,
  };
}

const ATTACHABLE_CEREMONY_KINDS: CeremonyKind[] = [
  'beisetzung',
  'verabschiedung',
  'trauerfeier',
];

export function isAttachableCeremonyKind(kind: CeremonyKind): boolean {
  return ATTACHABLE_CEREMONY_KINDS.includes(kind);
}

/** Überführung manuell an Feiertermin binden (gleicher Fall). */
export function attachTransferToCeremony(
  assignments: Record<string, PlanAssignment>,
  card: PlanningCard,
  ceremony: Pick<CeremonyInfo, 'kind' | 'dayKey' | 'zeit'>,
  order: number
): {
  assignments: Record<string, PlanAssignment>;
  assignment: PlanAssignment;
  eventType: 'ueberfuehrung_geplant' | 'ueberfuehrung_umgeplant';
} | null {
  if (!ceremony.dayKey || !isAttachableCeremonyKind(ceremony.kind)) return null;
  const attached: AttachedCeremonyRef = {
    kind: ceremony.kind,
    dayKey: ceremony.dayKey,
  };
  const next = moveCardAssignment(assignments, card, ceremony.dayKey, order, {
    plannedZeit: ceremony.zeit?.trim() || card.plannedZeit || null,
    attachedCeremony: attached,
  });
  const assignment = next[card.id]!;
  return {
    assignments: next,
    assignment,
    eventType: assignments[card.id] ? 'ueberfuehrung_umgeplant' : 'ueberfuehrung_geplant',
  };
}

/** Weitergegebenes Event rückgängig machen und aus dem Feed entfernen. */
export function undoPlanEvent(
  assignments: Record<string, PlanAssignment>,
  events: DispositionPlanEvent[],
  eventId: string
): {
  assignments: Record<string, PlanAssignment>;
  events: DispositionPlanEvent[];
  mode: 'restored' | 'removed' | 'noop';
} {
  const event = events.find((e) => e.id === eventId);
  if (!event || !canUndoPlanEvent(event, assignments)) {
    return { assignments, events, mode: 'noop' };
  }

  const withoutEvent = events.filter((e) => e.id !== eventId);
  const id = event.assignmentId!;

  if (event.type === 'ueberfuehrung_entfernt') {
    const snap = event.snapshot ?? event.previousSnapshot;
    if (!snap) return { assignments, events, mode: 'noop' };
    const existing = assignments[id];
    const restored: PlanAssignment = {
      id,
      docId: event.docId,
      zeile:
        typeof (snap as { zeile?: number }).zeile === 'number'
          ? (snap as { zeile?: number }).zeile!
          : (existing?.zeile ?? -1),
      plannedDayKey: snap.plannedDayKey,
      plannedKuehlraumId: snap.plannedKuehlraumId ?? null,
      plannedZeit: snap.plannedZeit ?? null,
      vonOrt: snap.vonOrt ?? null,
      nachOrt: snap.nachOrt ?? null,
      schrittTyp: snap.schrittTyp ?? null,
      source:
        (snap as { source?: string }).source === 'alamida'
          ? 'alamida'
          : existing?.source === 'alamida'
            ? 'alamida'
            : 'canvas',
      order: snap.order,
      attachedCeremony: snap.attachedCeremony ?? null,
      previous: null,
      updatedAtMs: Date.now(),
    };
    return {
      assignments: { ...assignments, [id]: restored },
      events: withoutEvent,
      mode: 'restored',
    };
  }

  if (event.type === 'ueberfuehrung_umgeplant') {
    const prevSnap = event.previousSnapshot ?? assignments[id]?.previous;
    if (prevSnap) {
      const current = assignments[id];
      const restored: PlanAssignment = {
        id,
        docId: current?.docId ?? event.docId,
        zeile: current?.zeile ?? -1,
        source: current?.source ?? 'canvas',
        ...prevSnap,
        previous: null,
        updatedAtMs: Date.now(),
      };
      return {
        assignments: { ...assignments, [id]: restored },
        events: withoutEvent,
        mode: 'restored',
      };
    }
  }

  // geplant: zurück zum Abholort (null-Tag stub), sonst löschen
  const current = assignments[id];
  if (current) {
    const cleared: PlanAssignment = {
      ...current,
      plannedDayKey: null,
      plannedZeit: null,
      attachedCeremony: null,
      previous: snapshotFromAssignment(current),
      updatedAtMs: Date.now(),
    };
    return {
      assignments: { ...assignments, [id]: cleared },
      events: withoutEvent,
      mode: 'removed',
    };
  }
  return {
    assignments: removeAssignment(assignments, id),
    events: withoutEvent,
    mode: 'removed',
  };
}

/**
 * Event-Eintrag mit × entfernen und zugehörige Überführung zurücksetzen
 * (plannedDayKey = null → wieder im Abholort-Pool).
 */
export function dismissPlanEvent(
  assignments: Record<string, PlanAssignment>,
  events: DispositionPlanEvent[],
  eventId: string
): {
  assignments: Record<string, PlanAssignment>;
  events: DispositionPlanEvent[];
  mode: 'dismissed' | 'noop';
} {
  const event = events.find((e) => e.id === eventId);
  if (!event) return { assignments, events, mode: 'noop' };

  const withoutEvent = events.filter((e) => e.id !== eventId);
  const id = event.assignmentId;
  let nextAssignments = assignments;

  if (id) {
    const current = assignments[id];
    if (current && current.plannedDayKey != null) {
      nextAssignments = {
        ...assignments,
        [id]: {
          ...current,
          plannedDayKey: null,
          plannedZeit: null,
          attachedCeremony: null,
          previous: snapshotFromAssignment(current),
          updatedAtMs: Date.now(),
        },
      };
    } else if (!current && event.type !== 'ueberfuehrung_entfernt') {
      // Geplant/umgeplant ohne Assignment → Stub mit null-Tag anlegen
      const snap = event.snapshot ?? event.previousSnapshot;
      const snapZeile =
        event.snapshot && typeof event.snapshot.zeile === 'number'
          ? event.snapshot.zeile
          : -1;
      const snapSource =
        event.snapshot?.source === 'alamida' ? 'alamida' : ('canvas' as const);
      nextAssignments = {
        ...assignments,
        [id]: {
          id,
          docId: event.docId,
          zeile: snapZeile,
          plannedDayKey: null,
          plannedKuehlraumId: snap?.plannedKuehlraumId ?? event.kuehlraumId ?? null,
          plannedZeit: null,
          vonOrt: snap?.vonOrt ?? event.vonOrt ?? null,
          nachOrt: snap?.nachOrt ?? event.nachOrt ?? null,
          schrittTyp: snap?.schrittTyp ?? null,
          source: snapSource,
          order: snap?.order ?? 0,
          attachedCeremony: null,
          previous: snap
            ? {
                plannedDayKey: snap.plannedDayKey,
                plannedKuehlraumId: snap.plannedKuehlraumId ?? null,
                plannedZeit: snap.plannedZeit ?? null,
                vonOrt: snap.vonOrt ?? null,
                nachOrt: snap.nachOrt ?? null,
                schrittTyp: snap.schrittTyp ?? null,
                order: snap.order,
                attachedCeremony: snap.attachedCeremony ?? null,
              }
            : event.plannedDayKey != null
              ? {
                  plannedDayKey: event.plannedDayKey,
                  plannedKuehlraumId: event.kuehlraumId ?? null,
                  plannedZeit: event.plannedZeit ?? null,
                  order: 0,
                }
              : null,
          updatedAtMs: Date.now(),
        },
      };
    }
  }

  return {
    assignments: nextAssignments,
    events: withoutEvent,
    mode: 'dismissed',
  };
}

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

export function todayDayKey(now = new Date()): string {
  return dayKeyFromDate(now);
}
