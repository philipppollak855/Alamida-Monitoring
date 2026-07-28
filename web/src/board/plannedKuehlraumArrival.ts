import type { Sterbefall } from '../types';
import type { DispositionSettings } from '../types/dispositionSettings';
import type { PlanAssignment } from '../planning/types';
import { schrittZielIstEigeneKr } from './ausstehendEffective';
import { matchEigenerKuehlraum } from '../settings/ortMatchers';
import {
  hatFaelligeAusfahrtAusEigenemKr,
  isImEigenenKuehlraum,
} from './kuehlraumLogic';
import { shouldHoldInKuehlraumUntilCheckout } from '../planning/kuehlraumCheckoutRules';

function formatDeDatumFromDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split('-');
  return `${d}.${m}.${y}`;
}

export type DuePlannedKuehlraumArrival = {
  docId: string;
  kuehlraumId: string;
  nachOrtLabel: string;
};

export type DuePlannedKuehlraumDeparture = {
  docId: string;
  vonOrt: string;
  nachOrt: string;
  terminAm: string;
};

export function normalizePlanHhMm(raw?: string | null): string | null {
  const t = raw?.trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return `${m[1]!.padStart(2, '0')}:${m[2]}`;
}

function hhMmFromDate(now: Date): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/** Ob die Planungs-Zuordnung zum Kalendertag „fällig“ ist (Tag vorbei oder Uhrzeit erreicht). */
export function isPlanAssignmentDue(
  assignment: Pick<PlanAssignment, 'plannedDayKey' | 'plannedZeit'>,
  calendarDay: string,
  now: Date
): boolean {
  const day = assignment.plannedDayKey?.trim();
  if (!day) return false;
  if (day < calendarDay) return true;
  if (day > calendarDay) return false;
  const plannedHm = normalizePlanHhMm(assignment.plannedZeit);
  if (!plannedHm) return true;
  return plannedHm <= hhMmFromDate(now);
}

function resolveAssignmentKuehlraum(
  assignment: PlanAssignment,
  settings: DispositionSettings
): { kuehlraumId: string; nachOrtLabel: string } | null {
  const byId = assignment.plannedKuehlraumId?.trim();
  if (byId) {
    const cfg = settings.eigeneKuehlraeume.find((k) => k.id === byId);
    if (cfg) {
      return {
        kuehlraumId: cfg.id,
        nachOrtLabel: cfg.alamidaName?.trim() || cfg.label,
      };
    }
  }

  const nach = assignment.nachOrt?.trim();
  const von = assignment.vonOrt?.trim();
  const matched =
    matchEigenerKuehlraum(nach, settings) ||
    (schrittZielIstEigeneKr({ vonOrt: von, nachOrt: nach })
      ? matchEigenerKuehlraum(nach || von, settings)
      : null);
  if (matched) {
    return {
      kuehlraumId: matched.id,
      nachOrtLabel: matched.alamidaName?.trim() || matched.label || nach || matched.id,
    };
  }

  return null;
}

function leavesOwnKuehlraum(
  assignment: PlanAssignment,
  settings: DispositionSettings
): boolean {
  const von = assignment.vonOrt?.trim();
  const nach = assignment.nachOrt?.trim();
  if (matchEigenerKuehlraum(von, settings)) {
    if (matchEigenerKuehlraum(nach, settings)) return false;
    return true;
  }
  // Canvas-Abgang ohne vonOrt: Quell-KR war geplant, Ziel nicht eigenes KR
  if (
    assignment.plannedKuehlraumId?.trim() &&
    !schrittZielIstEigeneKr({ vonOrt: von, nachOrt: nach }) &&
    !matchEigenerKuehlraum(nach, settings)
  ) {
    // plannedKuehlraumId am Abgang ist oft Ziel — eher Ankunft. Nur mit klarem von=KR.
    return false;
  }
  return false;
}

/**
 * Fällige Planungs-Ankünfte ins eigene Kühlraum (Tag/Uhrzeit erreicht).
 */
export function listDuePlannedKuehlraumArrivals(
  assignments: Record<string, PlanAssignment>,
  settings: DispositionSettings,
  calendarDay: string,
  now: Date
): DuePlannedKuehlraumArrival[] {
  const dueDepartures = new Set(
    listDuePlannedKuehlraumDepartures(assignments, settings, calendarDay, now).map(
      (d) => d.docId
    )
  );
  const byDoc = new Map<string, DuePlannedKuehlraumArrival>();

  for (const assignment of Object.values(assignments)) {
    if (!assignment.docId?.trim()) continue;
    if (dueDepartures.has(assignment.docId)) continue;
    if (!isPlanAssignmentDue(assignment, calendarDay, now)) continue;

    const goesToOwnKr =
      Boolean(assignment.plannedKuehlraumId?.trim()) ||
      schrittZielIstEigeneKr({
        vonOrt: assignment.vonOrt ?? undefined,
        nachOrt: assignment.nachOrt ?? undefined,
      });
    if (!goesToOwnKr) continue;
    if (leavesOwnKuehlraum(assignment, settings)) continue;

    const resolved = resolveAssignmentKuehlraum(assignment, settings);
    if (!resolved) continue;

    byDoc.set(assignment.docId, {
      docId: assignment.docId,
      kuehlraumId: resolved.kuehlraumId,
      nachOrtLabel: resolved.nachOrtLabel,
    });
  }

  return [...byDoc.values()];
}

/** Fällige Planungs-Abgänge aus dem eigenen Kühlraum. */
export function listDuePlannedKuehlraumDepartures(
  assignments: Record<string, PlanAssignment>,
  settings: DispositionSettings,
  calendarDay: string,
  now: Date
): DuePlannedKuehlraumDeparture[] {
  const byDoc = new Map<string, DuePlannedKuehlraumDeparture>();

  for (const assignment of Object.values(assignments)) {
    if (!assignment.docId?.trim()) continue;
    if (!isPlanAssignmentDue(assignment, calendarDay, now)) continue;
    if (!leavesOwnKuehlraum(assignment, settings)) continue;

    const day = assignment.plannedDayKey!.trim();
    const dateDe = formatDeDatumFromDayKey(day);
    const zeit = normalizePlanHhMm(assignment.plannedZeit);
    const terminAm = zeit ? `${dateDe} ${zeit}` : dateDe;

    byDoc.set(assignment.docId, {
      docId: assignment.docId,
      vonOrt: assignment.vonOrt?.trim() || 'Kühlraum',
      nachOrt: assignment.nachOrt?.trim() || 'Weiterführung',
      terminAm,
    });
  }

  return [...byDoc.values()];
}

function overlayDuePlannedKuehlraumDepartures(
  sterbefaelle: Sterbefall[],
  assignments: Record<string, PlanAssignment>,
  settings: DispositionSettings,
  calendarDay: string,
  now: Date
): Sterbefall[] {
  const due = listDuePlannedKuehlraumDepartures(assignments, settings, calendarDay, now);
  if (due.length === 0) return sterbefaelle;
  const byDoc = new Map(due.map((d) => [d.docId, d]));

  return sterbefaelle.map((s) => {
    const dep = byDoc.get(s.id);
    if (!dep) return s;
    if (shouldHoldInKuehlraumUntilCheckout(s, now)) return s;
    if (hatFaelligeAusfahrtAusEigenemKr(s, now)) return s;

    return {
      ...s,
      ausstehend: [
        ...(s.ausstehend ?? []),
        {
          zeile: 9900,
          schrittTyp: 'ueberfuehrung',
          vonOrt: dep.vonOrt,
          nachOrt: dep.nachOrt,
          terminAm: dep.terminAm,
          status: 'heute',
        },
      ],
    };
  });
}

/**
 * Patcht Fälle so, dass fällige Planungs-Ankünfte als Kühlraum-Belegung zählen
 * und fällige Abgänge die Belegung beenden (bis Alamida nachzieht).
 */
export function overlayDuePlannedKuehlraumArrivals(
  sterbefaelle: Sterbefall[],
  assignments: Record<string, PlanAssignment>,
  settings: DispositionSettings,
  calendarDay: string,
  now: Date
): Sterbefall[] {
  const withDepartures = overlayDuePlannedKuehlraumDepartures(
    sterbefaelle,
    assignments,
    settings,
    calendarDay,
    now
  );

  const due = listDuePlannedKuehlraumArrivals(assignments, settings, calendarDay, now);
  if (due.length === 0) return withDepartures;

  const byDoc = new Map(due.map((d) => [d.docId, d]));

  return withDepartures.map((s) => {
    const arrival = byDoc.get(s.id);
    if (!arrival) return s;
    if (isImEigenenKuehlraum(s, now)) return s;

    return {
      ...s,
      status: 'im_kuehlraum',
      aktuellePosition: arrival.nachOrtLabel,
      aktuellePositionTyp: 'ueberfuehrung',
      kuehlraumId: arrival.nachOrtLabel,
      kuehlraumIdDisposition: arrival.kuehlraumId,
    };
  });
}
