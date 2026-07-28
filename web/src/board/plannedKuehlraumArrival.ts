import type { Sterbefall } from '../types';
import type { DispositionSettings } from '../types/dispositionSettings';
import type { PlanAssignment } from '../planning/types';
import { schrittZielIstEigeneKr } from './ausstehendEffective';
import { matchEigenerKuehlraum } from '../settings/ortMatchers';
import { isImEigenenKuehlraum } from './kuehlraumLogic';

export type DuePlannedKuehlraumArrival = {
  docId: string;
  kuehlraumId: string;
  nachOrtLabel: string;
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

/**
 * Fällige Planungs-Ankünfte ins eigene Kühlraum (Tag/Uhrzeit erreicht).
 * Wird für Wandmonitor genutzt, solange Alamida die Position noch nicht nachgezogen hat.
 */
export function listDuePlannedKuehlraumArrivals(
  assignments: Record<string, PlanAssignment>,
  settings: DispositionSettings,
  calendarDay: string,
  now: Date
): DuePlannedKuehlraumArrival[] {
  const byDoc = new Map<string, DuePlannedKuehlraumArrival>();

  for (const assignment of Object.values(assignments)) {
    if (!assignment.docId?.trim()) continue;
    if (!isPlanAssignmentDue(assignment, calendarDay, now)) continue;

    const goesToOwnKr =
      Boolean(assignment.plannedKuehlraumId?.trim()) ||
      schrittZielIstEigeneKr({
        vonOrt: assignment.vonOrt ?? undefined,
        nachOrt: assignment.nachOrt ?? undefined,
      });
    if (!goesToOwnKr) continue;

    const resolved = resolveAssignmentKuehlraum(assignment, settings);
    if (!resolved) continue;

    // Neuere Zuordnung überschreibt ältere
    byDoc.set(assignment.docId, {
      docId: assignment.docId,
      kuehlraumId: resolved.kuehlraumId,
      nachOrtLabel: resolved.nachOrtLabel,
    });
  }

  return [...byDoc.values()];
}

/**
 * Patcht Fälle so, dass fällige Planungs-Ankünfte als Kühlraum-Belegung zählen
 * (Extern aus, Kühlraum-Slot belegt), bis Alamida die physische Position liefert.
 */
export function overlayDuePlannedKuehlraumArrivals(
  sterbefaelle: Sterbefall[],
  assignments: Record<string, PlanAssignment>,
  settings: DispositionSettings,
  calendarDay: string,
  now: Date
): Sterbefall[] {
  const due = listDuePlannedKuehlraumArrivals(assignments, settings, calendarDay, now);
  if (due.length === 0) return sterbefaelle;

  const byDoc = new Map(due.map((d) => [d.docId, d]));

  return sterbefaelle.map((s) => {
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
