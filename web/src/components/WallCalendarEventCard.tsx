import {
  calendarColorGroupFromArts,
  type WallCalendarEntry,
} from '../board/wallCalendar';
import {
  personnelAttentionTitle,
  type PersonnelAttention,
} from '../board/personnelBookingRules';
import { WallCalBestattungsBadge } from './WallCalBestattungsBadge';
import type { KeyboardEvent, MouseEvent } from 'react';

function isTransferGroupEntry(entry: WallCalendarEntry): {
  title: string;
  memberNames: string[];
} | null {
  if (entry.kremationGroupId && (entry.kremationMemberNames?.length ?? 0) > 1) {
    return { title: 'Kremation', memberNames: entry.kremationMemberNames ?? [] };
  }
  if (entry.fahrtGroupId && (entry.fahrtMemberNames?.length ?? 0) > 1) {
    return { title: 'Überführung', memberNames: entry.fahrtMemberNames ?? [] };
  }
  return null;
}

function PersonnelAttentionMarker({ kind }: { kind: PersonnelAttention }) {
  return (
    <span
      className={`wall-cal-personnel-marker wall-cal-personnel-marker--${kind}`}
      title={personnelAttentionTitle(kind)}
      aria-label={personnelAttentionTitle(kind)}
    />
  );
}

export function WallCalendarEventCard({
  entry,
  compact = false,
  strip = false,
  mobile = false,
  traegerLine,
  personnelAttention = null,
  onClick,
}: {
  entry: WallCalendarEntry;
  compact?: boolean;
  strip?: boolean;
  mobile?: boolean;
  /** Trägernamen klein unter dem Termin */
  traegerLine?: string | null;
  /** Kleiner Status-Marker: Personal offen / Bestätigung ausstehend */
  personnelAttention?: PersonnelAttention | null;
  onClick?: (entry: WallCalendarEntry) => void;
}) {
  const colorClass = `wall-cal-card--color-${calendarColorGroupFromArts(entry.arts)}`;
  const clickable = Boolean(onClick);
  const transferGroup = isTransferGroupEntry(entry);
  const memberNames = transferGroup?.memberNames ?? [];
  const groupTitle = transferGroup?.title ?? '';
  const attentionMarker = personnelAttention ? (
    <PersonnelAttentionMarker kind={personnelAttention} />
  ) : null;
  const bestattungsBadge = entry.bestattungsMarker ? (
    <WallCalBestattungsBadge marker={entry.bestattungsMarker} />
  ) : null;
  const traegerOpen = Boolean(
    traegerLine?.includes('Personal offen') || traegerLine?.includes('Bestätigung offen')
  );
  const traegerBadge = traegerLine ? (
    <span
      className={`wall-cal-traeger-line${traegerOpen ? ' is-open' : ''}`}
      title={
        traegerLine.includes('Bestätigung offen')
          ? personnelAttentionTitle('confirm')
          : traegerLine.includes('Personal offen')
            ? personnelAttentionTitle('open')
            : undefined
      }
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
    transferGroup ? 'is-krem-group' : '',
    clickable ? 'is-clickable' : '',
    personnelAttention ? `has-personnel-${personnelAttention}` : '',
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
        'aria-label': transferGroup
          ? `Kombinierte ${groupTitle}: ${memberNames.join(', ')}, ${entry.timeLabel}`
          : `Personal einbuchen: ${entry.name}, ${entry.timeLabel}`,
      }
    : {};

  if (transferGroup) {
    const route = entry.subtitle?.trim() || null;
    return (
      <article className={className} {...interactiveProps}>
        <div className={strip || mobile ? 'wall-cal-strip-top' : 'wall-cal-card-headline'}>
          {bestattungsBadge}
          {entry.timeLabel && entry.timeLabel !== '—' ? (
            <time className="wall-cal-time">{entry.timeLabel}</time>
          ) : null}
          {attentionMarker}
        </div>
        <span className="wall-cal-krem-title">{groupTitle}</span>
        <ul className="wall-cal-krem-names">
          {memberNames.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        {route ? <span className="wall-cal-strip-meta wall-cal-meta">{route}</span> : null}
        {traegerBadge}
      </article>
    );
  }

  if (mobile) {
    return (
      <article className={className} {...interactiveProps}>
        <div className="wall-cal-card-headline">
          {bestattungsBadge}
          <time className="wall-cal-time">{entry.timeLabel}</time>
          {attentionMarker}
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
          {attentionMarker}
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
          {attentionMarker}
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
      {!compact && entry.grouped && !entry.kremationGroupId && !entry.fahrtGroupId && (
        <span className="wall-cal-group-hint">Trauerblock · {entry.sterbefallId}</span>
      )}
    </article>
  );
}
