import { describe, expect, it } from 'vitest';
import {
  effectiveStandbyPeople,
  exclusionTooltip,
  expandStandbyForDay,
  isBereitschaftRelevantDay,
  listAbsencesForDay,
  absenceTooltip,
  personAbbrev,
  relevantDayKeysInRange,
  standbyStaffingWarning,
} from './bereitschaftRules';
import type { PersonnelStandby } from '../types/personnelBooking';

describe('bereitschaftRules', () => {
  it('personAbbrev', () => {
    expect(personAbbrev('Max Mustermann')).toBe('M.M.');
    expect(personAbbrev('Anna')).toBe('AN.');
    expect(personAbbrev('')).toBe('?');
  });

  it('isBereitschaftRelevantDay Fr/Sa/So und Feiertag', () => {
    expect(isBereitschaftRelevantDay('2026-07-24', 'AT')).toBe(true); // Fr
    expect(isBereitschaftRelevantDay('2026-07-25', 'AT')).toBe(true); // Sa
    expect(isBereitschaftRelevantDay('2026-07-26', 'AT')).toBe(true); // So
    expect(isBereitschaftRelevantDay('2026-07-27', 'AT')).toBe(false); // Mo
    expect(isBereitschaftRelevantDay('2026-10-26', 'AT')).toBe(true); // Nationalfeiertag Mo
    expect(isBereitschaftRelevantDay('2026-10-26', 'DE')).toBe(false);
  });

  it('relevantDayKeysInRange filtert', () => {
    const keys = relevantDayKeysInRange('2026-07-23', '2026-07-27', 'AT');
    expect(keys).toEqual(['2026-07-24', '2026-07-25', '2026-07-26']);
  });

  it('standbyStaffingWarning unter 2', () => {
    expect(standbyStaffingWarning(2)).toBeNull();
    expect(standbyStaffingWarning(1)).toMatch(/1 Person/);
    expect(standbyStaffingWarning(0)).toMatch(/Keine/);
  });

  const standbys: Record<string, PersonnelStandby> = {
    s1: {
      id: 's1',
      fromDayKey: '2026-07-25',
      toDayKey: '2026-07-26',
      personIds: ['p1', 'p2'],
      exclusions: [
        {
          id: 'ex1',
          personId: 'p1',
          dayKey: '2026-07-26',
          fromTime: '12:00',
          toTime: '14:00',
        },
      ],
    },
  };

  it('expandStandbyForDay inkl. Ausschlüsse', () => {
    const sat = expandStandbyForDay(standbys, '2026-07-25');
    expect(sat.map((p) => p.personId).sort()).toEqual(['p1', 'p2']);
    expect(sat.find((p) => p.personId === 'p1')?.exclusions).toHaveLength(0);

    const sun = expandStandbyForDay(standbys, '2026-07-26');
    expect(sun.find((p) => p.personId === 'p1')?.exclusions).toHaveLength(1);
    expect(exclusionTooltip(sun.find((p) => p.personId === 'p1')!.exclusions)).toContain(
      '12:00–14:00'
    );
  });

  it('effectiveStandbyPeople berücksichtigt Abwesenheit', () => {
    const absences = {
      a1: {
        personId: 'p2',
        fromDayKey: '2026-07-25',
        toDayKey: '2026-07-25',
      },
    };
    const people = effectiveStandbyPeople('2026-07-25', standbys, absences);
    expect(people.map((p) => p.personId)).toEqual(['p1']);
  });

  it('effectiveStandbyPeople filtert Ausschlussfenster bei Uhrzeit', () => {
    const at13 = effectiveStandbyPeople('2026-07-26', standbys, {}, '13:00');
    expect(at13.map((p) => p.personId).sort()).toEqual(['p2']);
    const at15 = effectiveStandbyPeople('2026-07-26', standbys, {}, '15:00');
    expect(at15.map((p) => p.personId).sort()).toEqual(['p1', 'p2']);
  });

  it('listAbsencesForDay zeigt ganztägig und teilweise', () => {
    const absences = {
      a1: {
        id: 'a1',
        personId: 'p1',
        fromDayKey: '2026-07-25',
        toDayKey: '2026-07-26',
      },
      a2: {
        id: 'a2',
        personId: 'p2',
        fromDayKey: '2026-07-25',
        toDayKey: '2026-07-25',
        fromTime: '08:00',
        toTime: '12:00',
      },
      a3: {
        id: 'a3',
        personId: 'p3',
        fromDayKey: '2026-07-28',
        toDayKey: '2026-07-28',
      },
    };
    const sat = listAbsencesForDay(absences, '2026-07-25');
    expect(sat.map((p) => p.personId).sort()).toEqual(['p1', 'p2']);
    expect(sat.find((p) => p.personId === 'p1')?.partial).toBe(false);
    expect(sat.find((p) => p.personId === 'p2')?.partial).toBe(true);
    expect(listAbsencesForDay(absences, '2026-07-27')).toEqual([]);
    expect(absenceTooltip('Max Mustermann', sat.find((p) => p.personId === 'p2')!)).toContain(
      '08:00–12:00'
    );
  });
});
