import { useEffect, useRef, type ReactNode } from 'react';
import type { WallCalendarDay, WallCalendarEntry } from '../board/wallCalendar';
import { summarizeWallCalendarDay } from '../board/wallCalendar';
import type { PersonnelAttention } from '../board/personnelBookingRules';
import { WallCalendarEventCard, type WallCalendarKremationDnD } from './WallCalendarEventCard';

interface Props {
  day: WallCalendarDay;
  mobile?: boolean;
  traegerLines?: Record<string, string | null | undefined>;
  personnelAttentionById?: Record<string, PersonnelAttention>;
  onEntryClick?: (entry: WallCalendarEntry) => void;
  kremationDnD?: WallCalendarKremationDnD | null;
  onAddTermin?: () => void;
  onOpenStandby?: () => void;
  onClose: () => void;
  headerExtra?: ReactNode;
}

export function WallCalendarDayDialog({
  day,
  mobile = false,
  traegerLines,
  personnelAttentionById,
  onEntryClick,
  kremationDnD,
  onAddTermin,
  onOpenStandby,
  onClose,
  headerExtra,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const { total, ueberfuehrungen } = summarizeWallCalendarDay(day.entries);
  const titleId = `wall-cal-day-dialog-title-${day.dayKey}`;

  useEffect(() => {
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="wall-cal-day-dialog-root" role="presentation">
      <button
        type="button"
        className="wall-cal-day-dialog-backdrop"
        aria-label="Schließen"
        onClick={onClose}
      />
      <div
        className={`wall-cal-day-dialog ${mobile ? 'wall-cal-day-dialog--mobile' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="wall-cal-day-dialog-head">
          <div className="wall-cal-day-dialog-head-text">
            <h3 id={titleId} className="wall-cal-day-dialog-title">
              {day.dayLabel}
            </h3>
            {day.isToday && <span className="wall-cal-today-pill">Heute</span>}
            <p className="wall-cal-day-dialog-stats">
              {total === 0
                ? 'Keine Termine'
                : `${total} Termin${total === 1 ? '' : 'e'}${
                    ueberfuehrungen > 0
                      ? ` · ${ueberfuehrungen} Überführung${ueberfuehrungen === 1 ? '' : 'en'}`
                      : ''
                  }`}
            </p>
            {headerExtra}
          </div>
          <button
            ref={closeRef}
            type="button"
            className="wall-cal-day-dialog-close"
            onClick={onClose}
            aria-label="Schließen"
          >
            ×
          </button>
        </header>
        {(onAddTermin || onOpenStandby) && (
          <div className="wall-cal-day-dialog-actions">
            {onOpenStandby && (
              <button type="button" className="wall-cal-add-termin" onClick={onOpenStandby}>
                Bereitschaft einplanen
              </button>
            )}
            {onAddTermin && (
              <button type="button" className="wall-cal-add-termin" onClick={onAddTermin}>
                + Termin zu Fall
              </button>
            )}
          </div>
        )}
        {total === 0 ? (
          <p className="wall-cal-day-dialog-empty">Keine Termine an diesem Tag</p>
        ) : (
          <ul className="wall-cal-day-dialog-list">
            {day.entries.map((e) => (
              <li key={e.id} className={`wall-cal-event ${e.grouped ? 'is-grouped' : ''}`}>
                <WallCalendarEventCard
                  entry={e}
                  mobile={mobile}
                  compact={!mobile}
                  traegerLine={traegerLines?.[e.id]}
                  personnelAttention={personnelAttentionById?.[e.id] ?? null}
                  onClick={onEntryClick}
                  kremationDnD={kremationDnD}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
