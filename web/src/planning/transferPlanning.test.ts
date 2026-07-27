import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { Sterbefall } from '../types';
import type { DispositionSettings } from '../types/dispositionSettings';
import { DEFAULT_DISPOSITION_SETTINGS } from '../config/defaultDispositionSettings';
import { setDispositionSettings } from '../settings/dispositionSettingsStore';
import {
  buildKuehlraumCapacities,
  buildKuehlraumRailStates,
  buildLocationGroups,
  buildPlanningCards,
  buildScheduleDraftFromSterbeort,
  buildSlotFreeEvents,
  buildSterbeortPool,
  moveCardAssignment,
  nextOrderInLane,
  planningCardId,
  resolveFreigabeState,
  scheduleToKuehlraum,
  undoOrRemoveAssignment,
} from './transferPlanning';
import type { PlanAssignment } from './types';

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
    expect(scheduled.assignment.id.startsWith('xy:canvas:')).toBe(true);
    expect(scheduled.eventType).toBe('ueberfuehrung_geplant');
    expect(scheduled.assignment.richtung).toBe('ankunft');

    const cards = buildPlanningCards(sterbefaelle, scheduled.assignments, settings);
    expect(cards[0].freigabeState).toBe('frei');
    expect(cards[0].ceremonies?.some((c) => c.kind === 'beisetzung')).toBe(true);

    const caps = buildKuehlraumCapacities(sterbefaelle, cards, settings, ['2026-07-28']);
    expect(caps[0].arrivals).toBe(1);
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

  it('legt mehrere Überführungs-Etappen an und macht Umplanung rückgängig', () => {
    const sterbefaelle = [
      fall({
        id: 'sulzer',
        sterbefallId: 'SF-SULZER',
        verstorbenerName: 'Sulzer',
        aktuellePosition: 'UK - Neunkirchen',
        aktuellePositionTyp: 'sterbeort',
        endziel: 'Krematorium',
      }),
    ];
    const kr = settings.eigeneKuehlraeume[0];
    const ankunft = scheduleToKuehlraum(
      {},
      {
        docId: 'sulzer',
        name: 'Sulzer',
        vonOrt: 'UK - Neunkirchen',
        nachOrt: kr.alamidaName || kr.label,
        kuehlraumId: kr.id,
        kuehlraumLabel: kr.label,
        dayKey: '2026-07-28',
        zeit: '10:00',
        schrittTyp: 'abholung',
        richtung: 'ankunft',
        createNewLeg: true,
      },
      10,
      null
    );
    expect(ankunft.assignment.richtung).toBe('ankunft');

    const abgang = scheduleToKuehlraum(
      ankunft.assignments,
      {
        docId: 'sulzer',
        name: 'Sulzer',
        createNewLeg: true,
        vonOrt: kr.alamidaName || kr.label,
        nachOrt: 'Krematorium',
        kuehlraumId: kr.id,
        kuehlraumLabel: kr.label,
        fromKuehlraumId: kr.id,
        dayKey: '2026-07-30',
        zeit: '09:00',
        schrittTyp: 'ueberfuehrung',
        richtung: 'abgang',
      },
      20,
      null
    );
    expect(Object.keys(abgang.assignments)).toHaveLength(2);
    expect(abgang.eventType).toBe('ueberfuehrung_geplant');

    const cards = buildPlanningCards(sterbefaelle, abgang.assignments, settings);
    expect(cards).toHaveLength(2);
    expect(cards.some((c) => c.targetsEigenerKr)).toBe(true);
    expect(cards.some((c) => c.leavesEigenerKr && !c.targetsEigenerKr)).toBe(true);

    const firstId = ankunft.assignment.id;
    const moved = scheduleToKuehlraum(
      abgang.assignments,
      {
        docId: 'sulzer',
        cardId: firstId,
        name: 'Sulzer',
        vonOrt: 'UK - Neunkirchen',
        nachOrt: kr.alamidaName || kr.label,
        kuehlraumId: kr.id,
        kuehlraumLabel: kr.label,
        dayKey: '2026-07-29',
        zeit: '11:00',
        schrittTyp: 'abholung',
        richtung: 'ankunft',
      },
      10,
      cards.find((c) => c.id === firstId)
    );
    expect(moved.eventType).toBe('ueberfuehrung_umgeplant');
    expect(moved.assignment.previous?.plannedDayKey).toBe('2026-07-28');

    const undone = undoOrRemoveAssignment(moved.assignments, firstId);
    expect(undone.mode).toBe('restored');
    expect(undone.restored?.plannedDayKey).toBe('2026-07-28');
  });
});
