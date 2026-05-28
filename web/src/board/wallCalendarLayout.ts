import { calendarColorGroupFromArts, type WallCalendarEntry } from './wallCalendar';

/** Überführung / Kremation: halbe Zeilenhöhe gegenüber Feierterminen. */
export function calendarEventFlexClass(
  entry: WallCalendarEntry
): 'wall-cal-event--half' | 'wall-cal-event--full' {
  const group = calendarColorGroupFromArts(entry.arts);
  return group === 'fahrt' || group === 'kremation' ? 'wall-cal-event--half' : 'wall-cal-event--full';
}

/** Gewichtete Slots (Feier = 2, Fahrt/Kremation = 1) für Schrift-Skalierung. */
export function calendarDayLayout(entries: WallCalendarEntry[]): {
  densityScale: number;
  slotWeight: number;
} {
  let slotWeight = 0;
  for (const e of entries) {
    const group = calendarColorGroupFromArts(e.arts);
    slotWeight += group === 'feier' ? 2 : 1;
  }
  if (slotWeight === 0) return { densityScale: 1, slotWeight: 0 };
  const densityScale = Math.min(1, Math.max(0.5, 7.5 / slotWeight));
  return { densityScale, slotWeight };
}
