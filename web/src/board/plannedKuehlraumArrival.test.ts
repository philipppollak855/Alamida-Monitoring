import { describe, expect, it, beforeEach } from 'vitest';
import {
  isPlanAssignmentDue,
  listDuePlannedKuehlraumArrivals,
  overlayDuePlannedKuehlraumArrivals,
} from './plannedKuehlraumArrival';
import { isImEigenenKuehlraum } from './kuehlraumLogic';
import { buildAlleEigeneKuehlraumSlots } from './boardUtils';
import { buildExternGruppen } from './wallExternUtils';
import { setDispositionSettings } from '../settings/dispositionSettingsStore';
import { DEFAULT_DISPOSITION_SETTINGS } from '../config/defaultDispositionSettings';
import type { Sterbefall } from '../types';
import type { PlanAssignment } from '../planning/types';

const settings = {
  ...DEFAULT_DISPOSITION_SETTINGS,
  eigeneKuehlraeume: [
    ...DEFAULT_DISPOSITION_SETTINGS.eigeneKuehlraeume,
    {
      id: 'gloggnitz',
      label: 'Kühlraum Gloggnitz',
      alamidaName: 'Kühlr. Gloggnitz',
      matchKeywords: ['gloggnitz', 'kühlr. gloggnitz'],
      externKeywords: ['neunkirchen'],
      wandTab: 'kuehlraum' as const,
      plaetze: 4,
    },
  ],
};

function fall(overrides: Partial<Sterbefall>): Sterbefall {
  return {
    id: 'doc-welzl',
    sterbefallId: '260200',
    verstorbenerName: 'Alfred Welzl',
    aktivInAlamida: true,
    aktuellePosition: 'UK - Neunkirchen',
    aktuellePositionTyp: 'sterbeort',
    abholort: 'UK - Neunkirchen',
    abholortIstKrankenhaus: true,
    ausstehend: [
      {
        zeile: 1,
        schrittTyp: 'abholung',
        vonOrt: 'UK - Neunkirchen',
        nachOrt: 'Kühlr. Gloggnitz',
        status: 'geplant',
      },
    ],
    ...overrides,
  };
}

function assignment(overrides: Partial<PlanAssignment> = {}): PlanAssignment {
  return {
    id: 'doc-welzl:1',
    docId: 'doc-welzl',
    zeile: 1,
    plannedDayKey: '2026-07-28',
    plannedZeit: '11:00',
    plannedKuehlraumId: 'gloggnitz',
    vonOrt: 'UK - Neunkirchen',
    nachOrt: 'Kühlr. Gloggnitz',
    schrittTyp: 'abholung',
    order: 0,
    ...overrides,
  };
}

describe('plannedKuehlraumArrival', () => {
  beforeEach(() => {
    setDispositionSettings(settings);
  });

  it('isPlanAssignmentDue: vor Uhrzeit noch nicht, danach ja', () => {
    const a = assignment();
    expect(isPlanAssignmentDue(a, '2026-07-28', new Date(2026, 6, 28, 10, 59))).toBe(false);
    expect(isPlanAssignmentDue(a, '2026-07-28', new Date(2026, 6, 28, 11, 0))).toBe(true);
    expect(isPlanAssignmentDue(a, '2026-07-29', new Date(2026, 6, 29, 8, 0))).toBe(true);
  });

  it('legt fällige Planungs-Ankunft als Kühlraum-Belegung und nicht mehr in Extern', () => {
    const s = fall();
    const now = new Date(2026, 6, 28, 11, 5);
    const assignments = { [assignment().id]: assignment() };

    expect(isImEigenenKuehlraum(s, now)).toBe(false);

    const overlaid = overlayDuePlannedKuehlraumArrivals(
      [s],
      assignments,
      settings,
      '2026-07-28',
      now
    );
    expect(isImEigenenKuehlraum(overlaid[0]!, now)).toBe(true);

    const grids = buildAlleEigeneKuehlraumSlots(overlaid, settings.eigeneKuehlraeume);
    const glog = grids.find((g) => g.cfg.id === 'gloggnitz');
    expect(glog?.slots.some((x) => x?.id === 'doc-welzl')).toBe(true);

    const extern = buildExternGruppen(overlaid, { settings });
    expect(
      extern.some((g) => g.faelle.some((f) => f.docId === 'doc-welzl' && g.typ === 'krankenhaus'))
    ).toBe(false);
  });

  it('funktioniert auch ohne plannedKuehlraumId, wenn nachOrt eigenes KR ist', () => {
    const a = assignment({ plannedKuehlraumId: null });
    const due = listDuePlannedKuehlraumArrivals(
      { [a.id]: a },
      settings,
      '2026-07-28',
      new Date(2026, 6, 28, 12, 0)
    );
    expect(due).toEqual([
      {
        docId: 'doc-welzl',
        kuehlraumId: 'gloggnitz',
        nachOrtLabel: 'Kühlr. Gloggnitz',
      },
    ]);
  });

  it('vor geplanter Uhrzeit keine Overlay-Belegung', () => {
    const s = fall();
    const overlaid = overlayDuePlannedKuehlraumArrivals(
      [s],
      { [assignment().id]: assignment() },
      settings,
      '2026-07-28',
      new Date(2026, 6, 28, 10, 0)
    );
    expect(overlaid[0]).toEqual(s);
    expect(isImEigenenKuehlraum(overlaid[0]!)).toBe(false);
  });
});
