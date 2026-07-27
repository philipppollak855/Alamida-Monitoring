import { dayKeyFromDate } from './dateUtils';
import type { HolidayRegion } from '../types/dispositionSettings';

/** Ostersonntag (Gregorianisch, Meeus/Jones/Butcher). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDaysLocal(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

function fixed(year: number, month: number, day: number): string {
  return dayKeyFromDate(new Date(year, month - 1, day));
}

/** Bundesweite Feiertage AT oder DE für ein Kalenderjahr (yyyy-MM-dd). */
export function publicHolidayKeys(year: number, region: HolidayRegion): Set<string> {
  const easter = easterSunday(year);
  const keys = new Set<string>();

  const add = (d: Date) => keys.add(dayKeyFromDate(d));
  const addFixed = (month: number, day: number) => keys.add(fixed(year, month, day));

  // Gemeinsam
  addFixed(1, 1); // Neujahr
  add(addDaysLocal(easter, -2)); // Karfreitag (DE; in AT oft kein gesetzlicher — trotzdem oft betrieblich)
  add(addDaysLocal(easter, 1)); // Ostermontag
  addFixed(5, 1); // Tag der Arbeit
  add(addDaysLocal(easter, 39)); // Christi Himmelfahrt
  add(addDaysLocal(easter, 50)); // Pfingstmontag
  addFixed(12, 25); // Weihnachten
  addFixed(12, 26); // Stefanitag / 2. Weihnachtstag

  if (region === 'AT') {
    addFixed(1, 6); // Heilige Drei Könige
    add(addDaysLocal(easter, 60)); // Fronleichnam
    addFixed(8, 15); // Mariä Himmelfahrt
    addFixed(10, 26); // Nationalfeiertag
    addFixed(11, 1); // Allerheiligen
    addFixed(12, 8); // Mariä Empfängnis
    // Karfreitag in AT kein bundesweiter gesetzlicher Feiertag — entfernen
    keys.delete(dayKeyFromDate(addDaysLocal(easter, -2)));
  } else {
    // DE bundesweit
    addFixed(10, 3); // Tag der Deutschen Einheit
    // Karfreitag bleibt
  }

  return keys;
}

const holidayCache = new Map<string, Set<string>>();

function holidaysForYear(year: number, region: HolidayRegion): Set<string> {
  const cacheKey = `${region}:${year}`;
  let set = holidayCache.get(cacheKey);
  if (!set) {
    set = publicHolidayKeys(year, region);
    holidayCache.set(cacheKey, set);
  }
  return set;
}

export function isPublicHoliday(dayKey: string, region: HolidayRegion = 'AT'): boolean {
  const m = dayKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  return holidaysForYear(+m[1]!, region).has(dayKey);
}

export function holidayLabel(dayKey: string, region: HolidayRegion = 'AT'): string | null {
  if (!isPublicHoliday(dayKey, region)) return null;
  const m = dayKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = +m[1]!;
  const easter = easterSunday(year);
  const key = dayKey;
  const d = (offset: number) => dayKeyFromDate(addDaysLocal(easter, offset));

  if (key === fixed(year, 1, 1)) return 'Neujahr';
  if (key === fixed(year, 1, 6)) return 'Heilige Drei Könige';
  if (key === d(-2)) return 'Karfreitag';
  if (key === d(1)) return 'Ostermontag';
  if (key === fixed(year, 5, 1)) return 'Tag der Arbeit';
  if (key === d(39)) return 'Christi Himmelfahrt';
  if (key === d(50)) return 'Pfingstmontag';
  if (key === d(60)) return 'Fronleichnam';
  if (key === fixed(year, 8, 15)) return 'Mariä Himmelfahrt';
  if (key === fixed(year, 10, 3)) return 'Tag der Deutschen Einheit';
  if (key === fixed(year, 10, 26)) return 'Nationalfeiertag';
  if (key === fixed(year, 11, 1)) return 'Allerheiligen';
  if (key === fixed(year, 12, 8)) return 'Mariä Empfängnis';
  if (key === fixed(year, 12, 25)) return 'Weihnachten';
  if (key === fixed(year, 12, 26)) return 'Stefanitag';
  return 'Feiertag';
}
