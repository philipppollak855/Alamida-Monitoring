import { describe, expect, it } from 'vitest';
import {
  easterSunday,
  holidayLabel,
  isPublicHoliday,
  publicHolidayKeys,
} from './publicHolidays';
import { dayKeyFromDate } from './dateUtils';

describe('publicHolidays', () => {
  it('berechnet Ostersonntag 2026', () => {
    expect(dayKeyFromDate(easterSunday(2026))).toBe('2026-04-05');
  });

  it('AT: Nationalfeiertag und Fronleichnam', () => {
    expect(isPublicHoliday('2026-10-26', 'AT')).toBe(true);
    expect(holidayLabel('2026-10-26', 'AT')).toBe('Nationalfeiertag');
    // Ostersonntag 2026-04-05 → Fronleichnam +60 = 2026-06-04
    expect(isPublicHoliday('2026-06-04', 'AT')).toBe(true);
    expect(isPublicHoliday('2026-06-04', 'DE')).toBe(false);
  });

  it('DE: Tag der Deutschen Einheit, kein AT-Nationalfeiertag', () => {
    expect(isPublicHoliday('2026-10-03', 'DE')).toBe(true);
    expect(isPublicHoliday('2026-10-26', 'DE')).toBe(false);
  });

  it('Ostermontag in beiden Regionen', () => {
    expect(isPublicHoliday('2026-04-06', 'AT')).toBe(true);
    expect(isPublicHoliday('2026-04-06', 'DE')).toBe(true);
  });

  it('Karfreitag nur DE bundesweit', () => {
    expect(isPublicHoliday('2026-04-03', 'DE')).toBe(true);
    expect(isPublicHoliday('2026-04-03', 'AT')).toBe(false);
  });

  it('publicHolidayKeys liefert Sets', () => {
    const at = publicHolidayKeys(2026, 'AT');
    const de = publicHolidayKeys(2026, 'DE');
    expect(at.has('2026-01-01')).toBe(true);
    expect(de.has('2026-01-01')).toBe(true);
    expect(at.has('2026-12-08')).toBe(true);
    expect(de.has('2026-12-08')).toBe(false);
  });
});
