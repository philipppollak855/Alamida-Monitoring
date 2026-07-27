import {
  calendarColorGroupFromArts,
  type WallCalendarEntry,
} from '../board/wallCalendar';
import { WallCalBestattungsBadge } from './WallCalBestattungsBadge';
import type { KeyboardEvent, MouseEvent } from 'react';

export function WallCalendarEventCard({
  entry,
  compact = false,
  strip = false,
  mobile = false,
  traegerLine,
  onClick,
}: {
  entry: WallCalendarEntry;
  compact?: boolean;
  strip?: boolean;
  mobile?: boolean;
  /** Trägernamen klein unter dem Termin */
  traegerLine?: string | null;
  onClick?: (entry: WallCalendarEntry) => void;
}) {
  const colorClass = `wall-cal-card--color-${calendarColorGroupFromArts(entry.arts)}`;
  const clickable = Boolean(onClick);
  const bestattungsBadge = entry.bestattungsMarker ? (
    <WallCalBestattungsBadge marker={entry.bestattungsMarker} />
  ) : null;
  const traegerOpen = Boolean(traegerLine?.includes('Personal offen'));
  const traegerBadge = traegerLine ? (
    <span
      className={`wall-cal-traeger-line${traegerOpen ? ' is-open' : ''}`}
      title={traegerOpen ? 'Personal noch nicht vollständig' : undefined}
    >
      {traegerLine}
    </span>
  ) : null;

  const className = [
    'wall-cal-card',
    mobile ? 'wall-cal-card--mobile' : '',
    strip ? 'wall-cal-card--strip' : '',
    compact && !strip && !mobile ? 'wall-cal-card--compact' : '',
    colorClass,
    entry.grouped ? 'is-grouped' : '',
    clickable ? 'is-clickable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handleClick = (e: MouseEvent) => {
    if (!onClick) return;
    e.stopPropagation();
    onClick(entry);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!onClick) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      onClick(entry);
    }
  };

  const interactiveProps = clickable
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick: handleClick,
        onKeyDown: handleKeyDown,
        'aria-label': `Personal einbuchen: ${entry.name}, ${entry.timeLabel}`,
      }
    : {};

  if (mobile) {
    return (
      <article className={className} {...interactiveProps}>
        <div className="wall-cal-card-headline">
          {bestattungsBadge}
          <time className="wall-cal-time">{entry.timeLabel}</time>
        </div>
        <div className="wall-cal-mobile-body">
          <span className="wall-cal-name">{entry.name}</span>
          <span className="wall-cal-mobile-line">
            <span className="wall-cal-mobile-types">{entry.badges.join(' · ')}</span>
            {(entry.subtitle || entry.title) && (
              <span className="wall-cal-meta">{entry.subtitle || entry.title}</span>
            )}
          </span>
          {traegerBadge}
        </div>
      </article>
    );
  }

  if (strip) {
    const stripMeta = entry.subtitle || entry.title;
    const stripTypes = entry.badges.join(' · ');
    return (
      <article className={className} {...interactiveProps}>
        <div className="wall-cal-strip-top">
          {bestattungsBadge}
          <time className="wall-cal-time">{entry.timeLabel}</time>
          {stripTypes && <span className="wall-cal-strip-types">{stripTypes}</span>}
        </div>
        <span className="wall-cal-name">{entry.name}</span>
        {stripMeta ? <span className="wall-cal-strip-meta">{stripMeta}</span> : null}
        {traegerBadge}
      </article>
    );
  }

  return (
    <article className={className} {...interactiveProps}>
      <div className="wall-cal-card-top">
        <div className="wall-cal-card-headline">
          {bestattungsBadge}
          <time className="wall-cal-time">{entry.timeLabel}</time>
        </div>
        <div className="wall-cal-badges">
          {entry.badges.map((b) => (
            <span key={b} className="wall-cal-badge">
              {b}
            </span>
          ))}
        </div>
      </div>
      <span className="wall-cal-name">{entry.name}</span>
      <span className="wall-cal-meta">{entry.subtitle || entry.title}</span>
      {traegerBadge}
      {!compact && entry.grouped && (
        <span className="wall-cal-group-hint">Trauerblock · {entry.sterbefallId}</span>
      )}
    </article>
  );
}
