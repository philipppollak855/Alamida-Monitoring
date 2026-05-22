import type { WallCalendarDay } from '../board/wallCalendar';

interface Props {
  days: WallCalendarDay[];
  /** Spalten im Raster (7 für Woche / Monat) */
  columns?: number;
  compact?: boolean;
}

/** Kompakte Tagesübersicht mit Terminanzahl (Monat, 7/14 Tage). */
export function WallCalendarPeriodOverview({ days, columns = 7, compact }: Props) {
  return (
    <div
      className={`wall-cal-period-overview ${compact ? 'wall-cal-period-overview--compact' : ''}`}
      style={{ '--cal-overview-cols': columns } as React.CSSProperties}
      aria-label="Zeitraumübersicht"
    >
      {days.map((day) => {
        const dayNum =
          day.dayLabel.split(',')[1]?.trim() ??
          day.dayLabel.replace(/^[^,]+,\s*/, '');
        return (
          <div
            key={day.dayKey}
            className={`wall-cal-period-cell ${day.isToday ? 'is-today' : ''} ${day.isWeekend ? 'is-weekend' : ''} ${day.entries.length > 0 ? 'has-events' : ''}`}
            title={
              day.entries.length > 0
                ? `${day.dayLabel}: ${day.entries.length} Termine`
                : day.dayLabel
            }
          >
            {!compact && (
              <span className="wall-cal-period-wd">{day.weekdayShort}</span>
            )}
            <span className="wall-cal-period-num">{dayNum}</span>
            {day.entries.length > 0 && (
              <span className="wall-cal-period-badge">{day.entries.length}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
