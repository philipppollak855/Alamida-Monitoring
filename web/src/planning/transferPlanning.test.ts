import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { Sterbefall } from '../types';
import type { DispositionSettings } from '../types/dispositionSettings';
import { DEFAULT_DISPOSITION_SETTINGS } from '../config/defaultDispositionSettings';
import { setDispositionSettings } from '../settings/dispositionSettingsStore';
import {
  buildKuehlraumCapacities,
  buildPlanningCards,
  buildScheduleDraftFromSterbeort,
  buildSterbeortPool,
  canvasPlanningId,
  moveCardAssignment,
  nextOrderInLane,
  planningCardId,
  scheduleToKuehlraum,
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

describe('transferPlanning', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 27, 12, 0, 0));
    setDispositionSettings(settings);
  });

  afterEach(() => {
    vi.useRealTimers();
    setDispositionSettings(DEFAULT_DISPOSITION_SETTINGS);
  });

  it('buildPlanningCards leitet Karten aus ausstehend ab und merged Assignments', () => {
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
          {
            zeile: 2,
            schrittTyp: 'kremation',
            vonOrt: 'Kühlr. Grafenbach',
            nachOrt: 'Krematorium St. Pölten',
            terminAm: '30.07.2026',
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
    expect(cards).toHaveLength(2);

    const first = cards.find((c) => c.zeile === 1)!;
    expect(first.plannedDayKey).toBe('2026-07-29');
    expect(first.sourceDayKey).toBe('2026-07-28');
    expect(first.targetsEigenerKr).toBe(true);
    expect(first.hasManualPlan).toBe(true);
    expect(first.kuehlraumId).toBe('grafenbach');
    expect(first.terminAm).toContain('14:30');

    const second = cards.find((c) => c.zeile === 2)!;
    expect(second.plannedDayKey).toBe('2026-07-30');
    expect(second.leavesEigenerKr).toBe(true);
    expect(second.targetsEigenerKr).toBe(false);
  });

  it('Sterbeort → Kühlraum legt Canvas-Überführung an und erhöht Kapazität', () => {
    const sterbefaelle = [
      fall({
        id: 'xy',
        sterbefallId: 'SF-XY',
        verstorbenerName: 'Fall XY',
        aktuellePosition: 'UK - Neunkirchen',
        aktuellePositionTyp: 'sterbeort',
        abholortIstKrankenhaus: true,
      }),
    ];

    const pool = buildSterbeortPool(sterbefaelle, [], settings);
    expect(pool).toHaveLength(1);
    expect(pool[0].docId).toBe('xy');

    const draft = buildScheduleDraftFromSterbeort({
      item: pool[0],
      dayKey: '2026-07-28',
      kuehlraum: settings.eigeneKuehlraeume[0],
      defaultZeit: '11:00',
    });

    const scheduled = scheduleToKuehlraum({}, draft, 10, null);
    expect(scheduled.eventType).toBe('ueberfuehrung_geplant');
    expect(scheduled.assignment.id).toBe(canvasPlanningId('xy', 'grafenbach'));
    expect(scheduled.assignment.plannedZeit).toBe('11:00');
    expect(scheduled.assignment.vonOrt).toContain('Neunkirchen');

    const cards = buildPlanningCards(sterbefaelle, scheduled.assignments, settings);
    expect(cards).toHaveLength(1);
    expect(cards[0].source).toBe('canvas');
    expect(cards[0].targetsEigenerKr).toBe(true);
    expect(cards[0].terminAm).toContain('11:00');

    const caps = buildKuehlraumCapacities(sterbefaelle, cards, settings, ['2026-07-28']);
    expect(caps[0].arrivals).toBe(1);
    expect(caps[0].projectedOccupied).toBe(1);

    const poolAfter = buildSterbeortPool(sterbefaelle, cards, settings);
    expect(poolAfter).toHaveLength(0);
  });

  it('buildKuehlraumCapacities prognostiziert Ankünfte und Abgänge', () => {
    const occupied = fall({
      id: 'occ',
      verstorbenerName: 'Belegt',
      aktuellePosition: 'UK - Neunkirchen',
      aktuellePositionTyp: 'sterbeort',
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

    const sterbefaelle = [
      occupied,
      fall({
        id: 'b1',
        verstorbenerName: 'Ankunft',
        ausstehend: [
          {
            zeile: 1,
            schrittTyp: 'abholung',
            vonOrt: 'KH Baden',
            nachOrt: 'Kühlr. Grafenbach',
            terminAm: '28.07.2026',
          },
        ],
      }),
      fall({
        id: 'b2',
        verstorbenerName: 'Abgang',
        ausstehend: [
          {
            zeile: 1,
            schrittTyp: 'kremation',
            vonOrt: 'Kühlr. Grafenbach',
            nachOrt: 'Krematorium St. Pölten',
            terminAm: '28.07.2026',
          },
        ],
      }),
    ];

    const cards = buildPlanningCards(sterbefaelle, {}, settings);
    expect(cards.some((c) => c.docId === 'occ')).toBe(false);

    const caps = buildKuehlraumCapacities(sterbefaelle, cards, settings, [
      '2026-07-28',
      '2026-07-29',
    ]);

    const day1 = caps.find((c) => c.dayKey === '2026-07-28')!;
    expect(day1.baseOccupied).toBeGreaterThanOrEqual(1);
    expect(day1.arrivals).toBe(1);
    expect(day1.departures).toBe(1);
    expect(day1.plaetze).toBe(3);

    const day2 = caps.find((c) => c.dayKey === '2026-07-29')!;
    expect(day2.arrivals).toBe(0);
    expect(day2.projectedOccupied).toBe(day1.projectedOccupied);
  });

  it('moveCardAssignment und nextOrderInLane aktualisieren den Plan', () => {
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

    const order = nextOrderInLane([], '2026-07-29');
    const next = moveCardAssignment({}, card, '2026-07-29', order);
    expect(next[card.id].plannedDayKey).toBe('2026-07-29');
    expect(next[card.id].order).toBe(10);
  });

  it('überbuchte Kapazität wird erkannt', () => {
    const sterbefaelle = Array.from({ length: 4 }, (_, i) =>
      fall({
        id: `x${i}`,
        verstorbenerName: `Fall ${i}`,
        ausstehend: [
          {
            zeile: 1,
            schrittTyp: 'abholung',
            vonOrt: 'KH',
            nachOrt: 'Kühlr. Grafenbach',
            terminAm: '28.07.2026',
          },
        ],
      })
    );

    const cards = buildPlanningCards(sterbefaelle, {}, settings);
    const caps = buildKuehlraumCapacities(sterbefaelle, cards, settings, ['2026-07-28']);
    expect(caps[0].overbooked).toBe(true);
    expect(caps[0].projectedOccupied).toBe(4);
  });
});
