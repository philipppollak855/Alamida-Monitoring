import { formatDayLabelDe } from '../../board/dateUtils';

type Props = {
  dayKeys: string[];
  focusDayKey: string;
  todayKey: string;
  countsByDay: Record<string, number>;
  selectionActive?: boolean;
  onSelectDay: (dayKey: string) => void;
  onDropOnDay?: (dayKey: string) => void;
};

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** Kompakte Wochen-Chips für die Mobile-Planung. */
export function PlanningDayStrip({
  dayKeys,
  focusDayKey,
  todayKey,
  countsByDay,
  selectionActive,
  onSelectDay,
  onDropOnDay,
}: Props) {
  return (
    <div
      className={`plan-mobile-day-strip${selectionActive ? ' has-selection' : ''}`}
      role="tablist"
      aria-label="Tage"
    >
      {dayKeys.map((dayKey) => {
        const d = new Date(`${dayKey}T12:00:00`);
        const wd = WD[d.getDay()] ?? '';
        const num = dayKey.slice(-2).replace(/^0/, '') || dayKey.slice(-2);
        const count = countsByDay[dayKey] ?? 0;
        const selected = focusDayKey === dayKey;
        const isToday = todayKey === dayKey;
        return (
          <button
            key={dayKey}
            type="button"
            role="tab"
            aria-selected={selected}
            title={formatDayLabelDe(dayKey)}
            className={[
              'plan-mobile-day-chip',
              selected ? ' is-selected' : '',
              isToday ? ' is-today' : '',
              count > 0 ? ' has-items' : '',
            ]
              .filter(Boolean)
              .join('')}
            onClick={() => {
              if (selectionActive && onDropOnDay) {
                onDropOnDay(dayKey);
                return;
              }
              onSelectDay(dayKey);
            }}
          >
            <span className="plan-mobile-day-wd">{wd}</span>
            <span className="plan-mobile-day-num">{num}</span>
            {count > 0 && <span className="plan-mobile-day-badge">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
