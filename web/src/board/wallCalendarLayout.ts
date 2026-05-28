import { calendarColorGroupFromArts, type WallCalendarEntry } from './wallCalendar';

/** Überführung / Kremation: halbe Zeilenhöhe gegenüber Feierterminen. */
export function calendarEventFlexClass(
  entry: WallCalendarEntry
): 'wall-cal-event--half' | 'wall-cal-event--full' {
  const group = calendarColorGroupFromArts(entry.arts);
  return group === 'fahrt' || group === 'kremation' ? 'wall-cal-event--half' : 'wall-cal-event--full';
}

export type CalendarDensityMode = 'month' | 'strip' | 'stripCompact';

/** Gewichtete Slots (Feier = 2, Fahrt/Kremation = 1) für Schrift-Skalierung. */
export function calendarDayLayout(
  entries: WallCalendarEntry[],
  mode: CalendarDensityMode = 'month'
): {
  densityScale: number;
  slotWeight: number;
} {
  let slotWeight = 0;
  for (const e of entries) {
    const group = calendarColorGroupFromArts(e.arts);
    slotWeight += group === 'feier' ? 2 : 1;
  }
  if (slotWeight === 0) return { densityScale: 1, slotWeight: 0 };

  const target = mode === 'stripCompact' ? 4 : mode === 'strip' ? 6 : 7.5;
  const minScale = mode === 'stripCompact' ? 0.32 : mode === 'strip' ? 0.42 : 0.5;
  const densityScale = Math.min(1, Math.max(minScale, target / slotWeight));
  return { densityScale, slotWeight };
}
