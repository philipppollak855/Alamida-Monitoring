import { addDays, dayKeyFromDate } from './dateUtils';
import { isPublicHoliday } from './publicHolidays';
import {
  isPersonAbsentAtTime,
  isPersonAbsentOnDay,
  parseTimeLabelMinutes,
} from './personnelBookingRules';
import type { HolidayRegion } from '../types/dispositionSettings';
import type {
  PersonnelAbsence,
  PersonnelStandby,
  PersonnelStandbyExclusion,
} from '../types/personnelBooking';

export const STANDBY_MIN_PEOPLE = 2;

export type StandbyDayPerson = {
  personId: string;
  standbyId: string;
  exclusions: PersonnelStandbyExclusion[];
  /** Ganztägig abwesend → nicht wirksam. */
  absentFullDay: boolean;
  /** Stundenweise abwesend (für Tooltip). */
  absentPartial: boolean;
};

export type EffectiveStandbyPerson = {
  personId: string;
  standbyId: string;
  exclusions: PersonnelStandbyExclusion[];
  absentPartial: boolean;
};

/** Fr (5), Sa (6), So (0) oder Feiertag. */
export function isBereitschaftRelevantDay(
  dayKey: string,
  region: HolidayRegion = 'AT'
): boolean {
  const m = dayKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const d = new Date(+m[1]!, +m[2]! - 1, +m[3]!);
  if (Number.isNaN(d.getTime())) return false;
  const wd = d.getDay();
  if (wd === 0 || wd === 5 || wd === 6) return true;
  return isPublicHoliday(dayKey, region);
}

/** „Max Mustermann“ → „M.M.“ */
export function personAbbrev(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.replace(/[^A-Za-zÀ-ÿÄÖÜäöüß]/g, ''))
    .filter((p) => p.length > 0);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    const w = parts[0]!;
    return (w.slice(0, 2) || '?').toUpperCase() + '.';
  }
  const first = parts[0]![0] ?? '?';
  const last = parts[parts.length - 1]![0] ?? '?';
  return `${first.toUpperCase()}.${last.toUpperCase()}.`;
}

export function standbyStaffingWarning(count: number): string | null {
  if (count >= STANDBY_MIN_PEOPLE) return null;
  if (count <= 0) return 'Keine Person eingeteilt (mind. 2 empfohlen).';
  return `Nur ${count} Person eingeteilt (mind. ${STANDBY_MIN_PEOPLE} empfohlen).`;
}

function dateFromDayKey(dayKey: string): Date | null {
  const m = dayKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(+m[1]!, +m[2]! - 1, +m[3]!);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Alle dayKeys von from–to inklusiv. */
export function dayKeysInRange(fromDayKey: string, toDayKey: string): string[] {
  const from = dateFromDayKey(fromDayKey);
  const to = dateFromDayKey(toDayKey);
  if (!from || !to || to < from) return [];
  const out: string[] = [];
  let cur = from;
  while (dayKeyFromDate(cur) <= toDayKey) {
    out.push(dayKeyFromDate(cur));
    cur = addDays(cur, 1);
    if (out.length > 400) break;
  }
  return out;
}

export function relevantDayKeysInRange(
  fromDayKey: string,
  toDayKey: string,
  region: HolidayRegion = 'AT'
): string[] {
  return dayKeysInRange(fromDayKey, toDayKey).filter((k) =>
    isBereitschaftRelevantDay(k, region)
  );
}

type AbsenceMap = Record<
  string,
  Pick<PersonnelAbsence, 'personId' | 'fromDayKey' | 'toDayKey' | 'fromTime' | 'toTime'>
>;

function hasHourlyAbsenceOnDay(
  absences: AbsenceMap,
  personId: string,
  dayKey: string
): boolean {
  for (const a of Object.values(absences)) {
    if (a.personId !== personId) continue;
    if (dayKey < a.fromDayKey || dayKey > a.toDayKey) continue;
    if (a.fromTime?.trim() || a.toTime?.trim()) return true;
  }
  return false;
}

function isFullDayAbsent(
  absences: AbsenceMap,
  personId: string,
  dayKey: string
): boolean {
  for (const a of Object.values(absences)) {
    if (a.personId !== personId) continue;
    if (dayKey < a.fromDayKey || dayKey > a.toDayKey) continue;
    const hasHours = Boolean(a.fromTime?.trim() || a.toTime?.trim());
    if (!hasHours) return true;
  }
  return false;
}

/** Roh-Zuordnung: Personen aus Standbys, die den Tag abdecken. */
export function expandStandbyForDay(
  standbys: Record<string, PersonnelStandby>,
  dayKey: string
): StandbyDayPerson[] {
  const byPerson = new Map<string, StandbyDayPerson>();
  for (const s of Object.values(standbys)) {
    if (dayKey < s.fromDayKey || dayKey > s.toDayKey) continue;
    for (const personId of s.personIds) {
      const dayExclusions = (s.exclusions ?? []).filter(
        (e) => e.personId === personId && e.dayKey === dayKey
      );
      const prev = byPerson.get(personId);
      if (prev) {
        prev.exclusions = [...prev.exclusions, ...dayExclusions];
        continue;
      }
      byPerson.set(personId, {
        personId,
        standbyId: s.id,
        exclusions: dayExclusions,
        absentFullDay: false,
        absentPartial: false,
      });
    }
  }
  return [...byPerson.values()];
}

/**
 * Wirksame Bereitschaftspersonen am Tag.
 * Ohne timeLabel: ganztägig Abwesende raus; stundenweise bleiben (absentPartial).
 * Mit timeLabel: auch stundenweise Abwesenheit / Ausschlussfenster filtern.
 */
export function effectiveStandbyPeople(
  dayKey: string,
  standbys: Record<string, PersonnelStandby>,
  absences: AbsenceMap = {},
  timeLabel?: string | null
): EffectiveStandbyPerson[] {
  const expanded = expandStandbyForDay(standbys, dayKey);
  const out: EffectiveStandbyPerson[] = [];

  for (const p of expanded) {
    if (isFullDayAbsent(absences, p.personId, dayKey)) continue;

    const absentPartial = hasHourlyAbsenceOnDay(absences, p.personId, dayKey);

    if (timeLabel != null && String(timeLabel).trim()) {
      if (isPersonAbsentAtTime(absences, p.personId, dayKey, timeLabel)) continue;
      if (isExcludedAtTime(p.exclusions, timeLabel)) continue;
    }

    out.push({
      personId: p.personId,
      standbyId: p.standbyId,
      exclusions: p.exclusions,
      absentPartial,
    });
  }
  return out;
}

export function isExcludedAtTime(
  exclusions: PersonnelStandbyExclusion[],
  timeLabel: string | null | undefined
): boolean {
  const mins = parseTimeLabelMinutes(timeLabel);
  if (mins == null) return false;
  for (const e of exclusions) {
    const from = parseTimeLabelMinutes(e.fromTime);
    const to = parseTimeLabelMinutes(e.toTime);
    if (from == null || to == null) continue;
    if (mins >= from && mins <= to) return true;
  }
  return false;
}

export function exclusionTooltip(exclusions: PersonnelStandbyExclusion[]): string | null {
  if (exclusions.length === 0) return null;
  return exclusions
    .map((e) => `außer ${e.fromTime}–${e.toTime}`)
    .join(', ');
}

/** Für Tagesanzeige: wirksame Personen + Staffing-Warnung. */
export function standbyDisplayForDay(
  dayKey: string,
  standbys: Record<string, PersonnelStandby>,
  absences: AbsenceMap = {}
): {
  people: EffectiveStandbyPerson[];
  warning: string | null;
  relevant: boolean;
} {
  const people = effectiveStandbyPeople(dayKey, standbys, absences);
  return {
    people,
    warning: standbyStaffingWarning(people.length),
    relevant: true,
  };
}

/** Ob Person am Tag in irgendeiner Bereitschaft steckt (ohne Abwesenheitsfilter). */
export function isPersonOnStandbyDay(
  standbys: Record<string, PersonnelStandby>,
  personId: string,
  dayKey: string
): boolean {
  return expandStandbyForDay(standbys, dayKey).some((p) => p.personId === personId);
}

export { isPersonAbsentOnDay };
