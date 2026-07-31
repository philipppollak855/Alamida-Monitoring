import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { Sterbefall } from '../types';
import type { DispositionSettings } from '../types/dispositionSettings';
import { DEFAULT_DISPOSITION_SETTINGS } from '../config/defaultDispositionSettings';
import { setDispositionSettings } from '../settings/dispositionSettingsStore';
import {
  attachKremationToGroup,
  attachTransferToCeremony,
  attachUeberfuehrungToFahrtGroup,
  buildKuehlraumCapacities,
  buildKuehlraumLocationGroups,
  buildKuehlraumRailStates,
  buildLocationGroups,
  buildPlanningCards,
  buildScheduleDraftFromSterbeort,
  buildSlotFreeEvents,
  buildSterbeortPool,
  canUndoPlanEvent,
  canvasPlanningId,
  clearCardToAbholort,
  defaultTargetKuehlraumId,
  detachKremationFromGroup,
  detachTransferFromCeremony,
  detachUeberfuehrungFromFahrtGroup,
  dismissPlanEvent,
  isCardAttachedToAnyCeremony,
  isCardAttachedToCeremony,
  moveCardAssignment,
  nextOrderInLane,
  partitionFahrtGroups,
  partitionKremationGroups,
  pickCeremonyHostForCard,
  planningCardId,
  resolveFreigabeState,
  scheduleToKuehlraum,
  undoOrRemoveAssignment,
  undoPlanEvent,
} from './transferPlanning';
import type { DispositionPlanEvent, PlanAssignment } from './types';

const settings: DispositionSettings = {
  ...DEFAULT_DISPOSITION_SETTINGS,
  eigeneKuehlraeume: [
    {
      id: 'grafenbach',
      label: 'Firmenkühlraum Grafenbach',
      alamidaName: 'Kühlr. Grafenbach',
      matchKeywords: [
        'grafenbach',
        'kühlr. grafenbach',
        'kuehlr. grafenbach',
        'kühl. grafenbach',
      ],
      externKeywords: [],
      wandTab: 'kuehlraum',
      plaetze: 3,
    },
  ],
};

function fall(partial: Partial<Sterbefall> & { id: string }): Sterbefall {
  return {
    verstorbenerName: partial.verstorbenerName ?? 'Test Fall',
    ...partial,
  };
}

describe('transferPlanning board', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 27, 12, 0, 0));
    setDispositionSettings(settings);
  });

  afterEach(() => {
    vi.useRealTimers();
    setDispositionSettings(DEFAULT_DISPOSITION_SETTINGS);
  });

  it('erkennt Freigabe-Status offen/geplant/frei', () => {
    expect(resolveFreigabeState({})).toBe('offen');
    expect(resolveFreigabeState({ freigabeFrei: true, freigabeDatum: '28.07.2026' })).toBe(
      'geplant'
    );
    expect(resolveFreigabeState({ freigabeFrei: true, freigabeDatum: '20.07.2026' })).toBe('frei');
  });

  it('gruppiert Sterbeorte und plant Sterbeort→Kühlraum mit Kapazität', () => {
    const sterbefaelle = [
      fall({
        id: 'xy',
        sterbefallId: 'SF-XY',
        verstorbenerName: 'Fall XY',
        aktuellePosition: 'UK - Neunkirchen',
        aktuellePositionTyp: 'sterbeort',
        abholortIstKrankenhaus: true,
        freigabeFrei: true,
        freigabeDatum: '26.07.2026',
        beisetzungsdatum: '02.08.2026',
      }),
    ];

    const pool = buildSterbeortPool(sterbefaelle, [], settings);
    expect(pool).toHaveLength(1);
    expect(pool[0].freigabeState).toBe('frei');

    const groups = buildLocationGroups(pool);
    expect(groups[0].label).toContain('Neunkirchen');

    const draft = buildScheduleDraftFromSterbeort({
      item: pool[0],
      dayKey: '2026-07-28',
      kuehlraum: settings.eigeneKuehlraeume[0],
      defaultZeit: '11:00',
    });
    const scheduled = scheduleToKuehlraum({}, draft, 10, null);
    expect(scheduled.assignment.id).toBe(canvasPlanningId('xy', 'grafenbach'));

    const cards = buildPlanningCards(sterbefaelle, scheduled.assignments, settings);
    expect(cards[0].freigabeState).toBe('frei');
    expect(cards[0].ceremonies?.some((c) => c.kind === 'beisetzung')).toBe(true);

    const caps = buildKuehlraumCapacities(sterbefaelle, cards, settings, ['2026-07-28']);
    expect(caps[0].arrivals).toBe(1);
  });

  it('plant Überführung Kühlraum→Kühlraum und zählt Kapazität Quell/Ziel', () => {
    const twoKr: DispositionSettings = {
      ...settings,
      eigeneKuehlraeume: [
        {
          ...settings.eigeneKuehlraeume[0],
          zeigeInLinkerPlanungsspalte: true,
        },
        {
          id: 'wrn',
          label: 'Kühlraum Wr. Neustadt',
          alamidaName: 'Kühlr. Wr. Neustadt',
          matchKeywords: ['wr. neustadt', 'wrneustadt', 'kühlr. wr'],
          externKeywords: [],
          wandTab: 'kuehlraum',
          plaetze: 4,
          zeigeInLinkerPlanungsspalte: true,
        },
      ],
    };
    setDispositionSettings(twoKr);

    const occupied = fall({
      id: 'kr1',
      sterbefallId: 'SF-KR',
      verstorbenerName: 'Im Kühlraum',
      aktuellePosition: 'Kühlr. Grafenbach',
      kuehlraumIdDisposition: 'grafenbach',
      kuehlplatzDisposition: '1',
      freigabeFrei: true,
      freigabeDatum: '20.07.2026',
    });

    const groups = buildKuehlraumLocationGroups([occupied], [], twoKr);
    expect(groups.some((g) => g.kind === 'kuehlraum' && g.items.length === 1)).toBe(true);
    const item = groups.flatMap((g) => g.items).find((i) => i.docId === 'kr1')!;
    expect(item.fromKuehlraumId).toBe('grafenbach');
    expect(defaultTargetKuehlraumId(item, twoKr)).toBe('wrn');

    const draft = buildScheduleDraftFromSterbeort({
      item,
      dayKey: '2026-07-28',
      kuehlraum: twoKr.eigeneKuehlraeume[1],
      defaultZeit: '09:30',
    });
    expect(draft.schrittTyp).toBe('ueberfuehrung');
    expect(draft.vonOrt).toContain('Grafenbach');
    expect(draft.nachOrt).toContain('Neustadt');

    const scheduled = scheduleToKuehlraum({}, draft, 10, null);
    const cards = buildPlanningCards([occupied], scheduled.assignments, twoKr);
    expect(cards).toHaveLength(1);
    expect(cards[0].leavesEigenerKr).toBe(true);
    expect(cards[0].targetsEigenerKr).toBe(true);
    expect(cards[0].kuehlraumId).toBe('wrn');

    // Belegung bleibt links sichtbar, auch wenn eine Planungs-Karte existiert
    const stillInLeft = buildKuehlraumLocationGroups([occupied], cards, twoKr);
    expect(stillInLeft.flatMap((g) => g.items).some((i) => i.docId === 'kr1')).toBe(true);

    const frees = buildSlotFreeEvents([occupied], cards, twoKr);
    expect(frees.some((f) => f.docId === 'kr1' && f.reason === 'ueberfuehrung')).toBe(true);

    const caps = buildKuehlraumCapacities([occupied], cards, twoKr, ['2026-07-28']);
    const src = caps.find((c) => c.kuehlraumId === 'grafenbach')!;
    const dst = caps.find((c) => c.kuehlraumId === 'wrn')!;
    expect(src.departures).toBe(1);
    expect(src.arrivals).toBe(0);
    expect(dst.arrivals).toBe(1);
    expect(dst.departures).toBe(0);
  });

  it('zaehlt geplante Ankunft nicht doppelt wenn Person schon im Ziel-KR liegt', () => {
    const occupied = fall({
      id: 'already',
      verstorbenerName: 'Schon da',
      aktuellePosition: 'Kühlr. Grafenbach',
      aktuellePositionTyp: 'kuehlraum',
      kuehlraumId: 'Kühlr. Grafenbach',
      kuehlplatz: '1',
      status: 'im_kuehlraum',
      freigabeFrei: true,
      freigabeDatum: '20.07.2026',
    });
    const draft = buildScheduleDraftFromSterbeort({
      item: {
        docId: occupied.id,
        sterbefallId: occupied.id,
        name: 'Schon da',
        vonOrt: 'UK',
        suggestedKuehlraumId: 'grafenbach',
        freigabeState: 'frei',
      },
      dayKey: '2026-07-28',
      kuehlraum: settings.eigeneKuehlraeume[0],
      defaultZeit: '09:00',
    });
    const scheduled = scheduleToKuehlraum({}, draft, 1, null);
    const cards = buildPlanningCards([occupied], scheduled.assignments, settings);
    expect(cards).toHaveLength(1);
    expect(cards[0].targetsEigenerKr).toBe(true);

    const rails = buildKuehlraumRailStates([occupied], cards, settings, '2026-07-28');
    const gb = rails.find((r) => r.id === 'grafenbach')!;
    expect(gb.occupiedNow).toBe(1);
    expect(gb.plannedArrivals).toBe(0);
    expect(gb.free).toBe(gb.plaetze - 1);

    const caps = buildKuehlraumCapacities([occupied], cards, settings, ['2026-07-28']);
    const day = caps.find((c) => c.kuehlraumId === 'grafenbach')!;
    expect(day.arrivals).toBe(0);
    expect(day.projectedOccupied).toBe(1);
    expect(day.free).toBe(settings.eigeneKuehlraeume[0].plaetze - 1);
  });

  it('meldet Platz frei bei Beisetzung aus dem Kühlraum', () => {
    const occupied = fall({
      id: 'occ',
      verstorbenerName: 'Belegt',
      aktuellePosition: 'UK - Neunkirchen',
      aktuellePositionTyp: 'sterbeort',
      beisetzungsdatum: '30.07.2026',
      ausstehend: [
        {
          zeile: 1,
          schrittTyp: 'abholung',
          vonOrt: 'UK - Neunkirchen',
          nachOrt: 'Kühlr. Grafenbach',
          terminAm: '20.07.2026',
          status: 'geplant',
        },
      ],
    });

    const cards = buildPlanningCards([occupied], {}, settings);
    const frees = buildSlotFreeEvents([occupied], cards, settings);
    expect(frees.some((f) => f.reason === 'beisetzung' && f.dayKey === '2026-07-30')).toBe(true);

    const rails = buildKuehlraumRailStates([occupied], cards, settings, '2026-07-30');
    expect(rails[0].occupants.length).toBeGreaterThanOrEqual(1);
    expect(rails[0].slotFrees.some((f) => f.reason === 'beisetzung')).toBe(true);
  });

  it('setzt Slot-Frei / Attach auf Feier − 1h (Ausbuchungsregel)', () => {
    const occupied = fall({
      id: 'occ2',
      verstorbenerName: 'Feier',
      aktuellePosition: 'Kühlr. Grafenbach',
      aktuellePositionTyp: 'kuehlraum',
      kuehlraumId: 'Kühlr. Grafenbach',
      kuehlplatz: '1',
      status: 'im_kuehlraum',
      imAnschluss: true,
      trauerfeierdatum: '28.07.2026',
      trauerfeierzeit: '14:00',
      beisetzungsdatum: '28.07.2026',
      ausstehend: [
        {
          zeile: 1,
          schrittTyp: 'ueberfuehrung',
          vonOrt: 'Grafenbach',
          nachOrt: 'Friedhof',
          terminAm: '28.07.2026',
          status: 'heute',
        },
      ],
    });
    const cards = buildPlanningCards([occupied], {}, settings);
    const card = cards[0]!;
    const attached = attachTransferToCeremony(
      {},
      card,
      { kind: 'trauerfeier', dayKey: '2026-07-28', zeit: '14:00' },
      10
    );
    expect(attached!.assignment.plannedZeit).toBe('13:00');

    const frees = buildSlotFreeEvents(
      [occupied],
      buildPlanningCards([occupied], attached!.assignments, settings),
      settings
    );
    const leave = frees.find((f) => f.docId === 'occ2' && f.dayKey === '2026-07-28');
    expect(leave?.zeit).toBe('13:00');
  });

  it('buildPlanningCards merged Assignments mit Uhrzeit', () => {
    const sterbefaelle = [
      fall({
        id: 'a1',
        sterbefallId: 'SF-1',
        verstorbenerName: 'Meier Anna',
        ausstehend: [
          {
            zeile: 1,
            schrittTyp: 'abholung',
            vonOrt: 'UK Krems',
            nachOrt: 'Kühlr. Grafenbach',
            terminAm: '28.07.2026',
            status: 'geplant',
          },
        ],
      }),
    ];
    const assignments: Record<string, PlanAssignment> = {
      [planningCardId('a1', 1)]: {
        id: planningCardId('a1', 1),
        docId: 'a1',
        zeile: 1,
        plannedDayKey: '2026-07-29',
        plannedZeit: '14:30',
        order: 20,
        source: 'alamida',
      },
    };
    const cards = buildPlanningCards(sterbefaelle, assignments, settings);
    expect(cards[0].terminAm).toContain('14:30');
    expect(cards[0].plannedDayKey).toBe('2026-07-29');
  });

  it('moveCardAssignment aktualisiert den Plan', () => {
    const card = buildPlanningCards(
      [
        fall({
          id: 'c1',
          ausstehend: [
            {
              zeile: 1,
              schrittTyp: 'ueberfuehrung',
              vonOrt: 'A',
              nachOrt: 'Kühlr. Grafenbach',
              terminAm: '28.07.2026',
            },
          ],
        }),
      ],
      {},
      settings
    )[0];
    const next = moveCardAssignment({}, card, '2026-07-29', nextOrderInLane([], '2026-07-29'));
    expect(next[card.id].plannedDayKey).toBe('2026-07-29');
  });

  it('macht Umplanung rückgängig und stellt entfernte Events wieder her', () => {
    const sterbefaelle = [
      fall({
        id: 'u1',
        aktuellePosition: 'UK - Neunkirchen',
        aktuellePositionTyp: 'sterbeort',
        abholortIstKrankenhaus: true,
        ausstehend: [
          {
            zeile: 1,
            schrittTyp: 'ueberfuehrung',
            vonOrt: 'A',
            nachOrt: 'B',
            terminAm: '28.07.2026',
          },
        ],
      }),
    ];
    const card = buildPlanningCards(sterbefaelle, {}, settings)[0]!;
    const first = moveCardAssignment({}, card, '2026-07-28', 10);
    const second = moveCardAssignment(first, { ...card, hasManualPlan: true }, '2026-07-29', 20);
    expect(second[card.id]!.previous?.plannedDayKey).toBe('2026-07-28');

    const cardWithPlan = {
      ...card,
      hasManualPlan: true,
      plannedDayKey: '2026-07-29',
      canUndoUmplanung: true,
    };
    const restored = undoOrRemoveAssignment(second, cardWithPlan);
    expect(restored.mode).toBe('restored');
    expect(restored.restored?.plannedDayKey).toBe('2026-07-28');
    expect(restored.restored?.previous).toBeNull();

    const cleared = undoOrRemoveAssignment(restored.assignments, {
      ...cardWithPlan,
      plannedDayKey: '2026-07-28',
      canUndoUmplanung: false,
    });
    expect(cleared.mode).toBe('cleared');
    expect(cleared.cleared?.plannedDayKey).toBeNull();

    const pool = buildSterbeortPool(
      sterbefaelle,
      buildPlanningCards(sterbefaelle, cleared.assignments, settings),
      settings
    );
    expect(pool.some((p) => p.docId === 'u1')).toBe(true);

    const events: DispositionPlanEvent[] = [
      {
        id: 'ev1',
        type: 'ueberfuehrung_entfernt',
        docId: 'u1',
        assignmentId: card.id,
        plannedDayKey: '2026-07-28',
        snapshot: {
          plannedDayKey: '2026-07-28',
          order: 10,
          zeile: 1,
          source: 'alamida',
        },
        createdAtMs: 1,
      },
    ];
    expect(canUndoPlanEvent(events[0]!, cleared.assignments)).toBe(true);
    const undone = undoPlanEvent(cleared.assignments, events, 'ev1');
    expect(undone.mode).toBe('restored');
    expect(undone.assignments[card.id]?.plannedDayKey).toBe('2026-07-28');
    expect(undone.events).toHaveLength(0);
  });

  it('hängt Überführung manuell an Feiertermin', () => {
    const sterbefaelle = [
      fall({
        id: 'a1',
        verstorbenerName: 'Meier',
        beisetzungsdatum: '30.07.2026 14:00',
        ausstehend: [
          {
            zeile: 1,
            schrittTyp: 'ueberfuehrung',
            vonOrt: 'KR',
            nachOrt: 'Friedhof',
            terminAm: '28.07.2026',
          },
        ],
      }),
    ];
    const card = buildPlanningCards(sterbefaelle, {}, settings)[0]!;
    const result = attachTransferToCeremony(
      {},
      card,
      { kind: 'beisetzung', dayKey: '2026-07-30', zeit: '14:00' },
      10
    );
    expect(result).not.toBeNull();
    expect(result!.assignment.plannedDayKey).toBe('2026-07-30');
    expect(result!.assignment.attachedCeremony).toEqual({
      kind: 'beisetzung',
      dayKey: '2026-07-30',
    });
    expect(result!.assignment.plannedZeit).toBe('13:00');

    const cards = buildPlanningCards(sterbefaelle, result!.assignments, settings);
    expect(cards[0]!.attachedCeremony?.kind).toBe('beisetzung');
    expect(cards[0]!.canUndoUmplanung).toBe(false);
  });

  it('clearCardToAbholort setzt Tag zurück und öffnet den Ort-Pool', () => {
    const sterbefaelle = [
      fall({
        id: 'ab1',
        aktuellePosition: 'UK Krems',
        aktuellePositionTyp: 'sterbeort',
        abholortIstKrankenhaus: true,
        ausstehend: [
          {
            zeile: 1,
            schrittTyp: 'abholung',
            vonOrt: 'UK Krems',
            nachOrt: 'Kühlr. Grafenbach',
            terminAm: '28.07.2026',
            status: 'geplant',
          },
        ],
      }),
    ];
    const card = buildPlanningCards(sterbefaelle, {}, settings)[0]!;
    const scheduled = moveCardAssignment({}, card, '2026-07-29', 10);
    const cleared = clearCardToAbholort(scheduled, {
      ...card,
      plannedDayKey: '2026-07-29',
      hasManualPlan: true,
    });
    expect(cleared.assignment.plannedDayKey).toBeNull();
    const cards = buildPlanningCards(sterbefaelle, cleared.assignments, settings);
    expect(cards[0]!.plannedDayKey).toBeNull();
    const pool = buildSterbeortPool(sterbefaelle, cards, settings);
    expect(pool.some((p) => p.docId === 'ab1')).toBe(true);
  });

  it('dismissPlanEvent setzt Überführung zurück und löscht den Eintrag', () => {
    const id = planningCardId('d1', 1);
    const assignments: Record<string, PlanAssignment> = {
      [id]: {
        id,
        docId: 'd1',
        zeile: 1,
        plannedDayKey: '2026-07-29',
        plannedZeit: '10:00',
        order: 10,
        source: 'alamida',
      },
    };
    const events: DispositionPlanEvent[] = [
      {
        id: 'ev-d1',
        type: 'ueberfuehrung_geplant',
        docId: 'd1',
        assignmentId: id,
        plannedDayKey: '2026-07-29',
        plannedZeit: '10:00',
        createdAtMs: 1,
      },
    ];
    const result = dismissPlanEvent(assignments, events, 'ev-d1');
    expect(result.mode).toBe('dismissed');
    expect(result.events).toHaveLength(0);
    expect(result.assignments[id]?.plannedDayKey).toBeNull();
  });

  it('pickCeremonyHostForCard wählt Beisetzung vor Trauerfeier', () => {
    const card = {
      id: 'c:1',
      docId: 'fall1',
      zeile: 1,
      sterbefallId: 'SF',
      name: 'Test',
      schrittTyp: 'ueberfuehrung',
      vonOrt: 'A',
      nachOrt: 'B',
      terminAm: '30.07.2026',
      sourceDayKey: null,
      plannedDayKey: '2026-07-30',
      status: 'geplant',
      targetsEigenerKr: false,
      leavesEigenerKr: true,
      kuehlraumId: null,
      order: 10,
      hasManualPlan: true,
      source: 'alamida' as const,
      ceremonies: [
        {
          kind: 'trauerfeier' as const,
          datum: '30.07.2026',
          dayKey: '2026-07-30',
          label: 'TF',
        },
        {
          kind: 'beisetzung' as const,
          datum: '30.07.2026',
          dayKey: '2026-07-30',
          label: 'Beisetzung',
        },
      ],
    };
    const host = pickCeremonyHostForCard(card, [
      {
        docId: 'fall1',
        ceremony: {
          kind: 'trauerfeier',
          datum: '30.07.2026',
          dayKey: '2026-07-30',
          label: 'TF',
        },
      },
      {
        docId: 'fall1',
        ceremony: {
          kind: 'beisetzung',
          datum: '30.07.2026',
          dayKey: '2026-07-30',
          label: 'Beisetzung',
        },
      },
    ]);
    expect(host?.ceremony.kind).toBe('beisetzung');
  });

  it('detachTransferFromCeremony trennt Überführung vom Feiertermin', () => {
    const card = {
      id: 'c:1',
      docId: 'fall1',
      zeile: 1,
      sterbefallId: 'SF',
      name: 'Test',
      schrittTyp: 'ueberfuehrung',
      vonOrt: 'A',
      nachOrt: 'B',
      terminAm: '30.07.2026',
      sourceDayKey: null,
      plannedDayKey: '2026-07-30',
      status: 'geplant',
      targetsEigenerKr: false,
      leavesEigenerKr: true,
      kuehlraumId: null,
      order: 10,
      hasManualPlan: true,
      source: 'alamida' as const,
      attachedCeremony: { kind: 'trauerfeier' as const, dayKey: '2026-07-30' },
      ceremonies: [
        {
          kind: 'trauerfeier' as const,
          datum: '30.07.2026',
          dayKey: '2026-07-30',
          label: 'TF',
        },
      ],
    };
    expect(isCardAttachedToAnyCeremony(card)).toBe(true);
    const detached = detachTransferFromCeremony({}, card, '2026-07-30', 10);
    expect(detached.assignment.attachedCeremony).toBeNull();
    expect(detached.assignment.detachedFromCeremony).toBe(true);
    expect(
      isCardAttachedToAnyCeremony({
        ...card,
        attachedCeremony: null,
        detachedFromCeremony: true,
      })
    ).toBe(false);
  });

  it('attachKremationToGroup fasst Kremationen zusammen und detach trennt', () => {
    const a = {
      id: 'a:1',
      docId: 'fallA',
      zeile: 1,
      sterbefallId: 'A',
      name: 'Alpha',
      schrittTyp: 'kremation',
      vonOrt: 'KR',
      nachOrt: 'Feba',
      terminAm: '30.07.2026',
      sourceDayKey: null,
      plannedDayKey: '2026-07-30',
      plannedZeit: '09:00',
      status: 'geplant',
      targetsEigenerKr: false,
      leavesEigenerKr: true,
      kuehlraumId: null,
      order: 10,
      hasManualPlan: true,
      source: 'alamida' as const,
    };
    const b = {
      ...a,
      id: 'b:1',
      docId: 'fallB',
      sterbefallId: 'B',
      name: 'Beta',
      order: 20,
      plannedZeit: null as string | null,
    };
    const attached = attachKremationToGroup({}, a, b, 30);
    expect(attached).not.toBeNull();
    const gid = attached!.groupId;
    expect(attached!.assignments['a:1']!.kremationGroupId).toBe(gid);
    expect(attached!.assignments['b:1']!.kremationGroupId).toBe(gid);
    expect(attached!.assignments['a:1']!.plannedZeit).toBe('09:00');

    const cards = [
      { ...a, kremationGroupId: gid },
      { ...b, kremationGroupId: gid, plannedZeit: '09:00' as string | null },
    ];
    const parts = partitionKremationGroups(cards);
    expect(parts.groups).toHaveLength(1);
    expect(parts.groups[0]!.members.map((m) => m.name)).toEqual(['Alpha', 'Beta']);
    expect(parts.singles).toHaveLength(0);

    const detached = detachKremationFromGroup(attached!.assignments, a, '2026-07-30', 40);
    expect(detached.assignment.kremationGroupId).toBeNull();
  });

  it('attachUeberfuehrungToFahrtGroup fasst Überführungen verschiedener Fälle zusammen', () => {
    const a = {
      id: 'a:1',
      docId: 'fallA',
      zeile: 1,
      sterbefallId: 'A',
      name: 'Alpha',
      schrittTyp: 'ueberfuehrung',
      vonOrt: 'KR',
      nachOrt: 'Friedhof',
      terminAm: '30.07.2026',
      sourceDayKey: null,
      plannedDayKey: '2026-07-30',
      plannedZeit: '10:00',
      status: 'geplant',
      targetsEigenerKr: false,
      leavesEigenerKr: true,
      kuehlraumId: null,
      order: 10,
      hasManualPlan: true,
      source: 'alamida' as const,
    };
    const b = {
      ...a,
      id: 'b:1',
      docId: 'fallB',
      sterbefallId: 'B',
      name: 'Beta',
      order: 20,
      plannedZeit: null as string | null,
    };
    const attached = attachUeberfuehrungToFahrtGroup({}, a, b, 30);
    expect(attached).not.toBeNull();
    const gid = attached!.groupId;
    expect(attached!.assignments['a:1']!.fahrtGroupId).toBe(gid);
    expect(attached!.assignments['b:1']!.fahrtGroupId).toBe(gid);
    expect(attached!.assignments['a:1']!.plannedZeit).toBe('10:00');

    const cards = [
      { ...a, fahrtGroupId: gid },
      { ...b, fahrtGroupId: gid, plannedZeit: '10:00' as string | null },
    ];
    const parts = partitionFahrtGroups(cards);
    expect(parts.groups).toHaveLength(1);
    expect(parts.groups[0]!.members.map((m) => m.name)).toEqual(['Alpha', 'Beta']);
    expect(parts.singles).toHaveLength(0);

    const detached = detachUeberfuehrungFromFahrtGroup(
      attached!.assignments,
      a,
      '2026-07-30',
      40
    );
    expect(detached.assignment.fahrtGroupId).toBeNull();
  });

  it('attachTransferToCeremony erlaubt anderen Fall mit hostDocId', () => {
    const card = {
      id: 'a:1',
      docId: 'fallA',
      zeile: 1,
      sterbefallId: 'A',
      name: 'Alpha',
      schrittTyp: 'ueberfuehrung',
      vonOrt: 'KR',
      nachOrt: 'Friedhof',
      terminAm: '30.07.2026',
      sourceDayKey: null,
      plannedDayKey: '2026-07-29',
      plannedZeit: null as string | null,
      status: 'geplant',
      targetsEigenerKr: false,
      leavesEigenerKr: true,
      kuehlraumId: null,
      order: 10,
      hasManualPlan: true,
      source: 'alamida' as const,
    };
    const result = attachTransferToCeremony(
      {},
      card,
      {
        kind: 'beisetzung',
        dayKey: '2026-07-30',
        zeit: '14:00',
        hostDocId: 'fallB',
      },
      5
    );
    expect(result).not.toBeNull();
    expect(result!.assignment.attachedCeremony).toEqual({
      kind: 'beisetzung',
      dayKey: '2026-07-30',
      hostDocId: 'fallB',
    });
    expect(result!.assignment.plannedDayKey).toBe('2026-07-30');
    expect(
      isCardAttachedToCeremony(
        {
          ...card,
          plannedDayKey: '2026-07-30',
          attachedCeremony: result!.assignment.attachedCeremony,
        },
        { kind: 'beisetzung', dayKey: '2026-07-30' },
        'fallB'
      )
    ).toBe(true);
    expect(
      isCardAttachedToCeremony(
        {
          ...card,
          plannedDayKey: '2026-07-30',
          attachedCeremony: result!.assignment.attachedCeremony,
        },
        { kind: 'beisetzung', dayKey: '2026-07-30' },
        'fallA'
      )
    ).toBe(false);
  });
});
