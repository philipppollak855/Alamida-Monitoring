import { useCallback } from 'react';
import type { WallCalendarEntry } from '../board/wallCalendar';
import {
  formatCalendarEntryShareText,
  getWhatsAppShareUrl,
  shareCalendarEntry,
} from '../utils/calendarShare';

interface Props {
  entry: WallCalendarEntry;
  compact?: boolean;
}

export function WallCalendarTerminShare({ entry, compact }: Props) {
  const shareText = formatCalendarEntryShareText(entry);
  const whatsAppHref = getWhatsAppShareUrl(shareText);

  const onShareClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        e.preventDefault();
        void shareCalendarEntry(entry);
      }
    },
    [entry]
  );

  return (
    <a
      href={whatsAppHref}
      className={`wall-cal-share-link ${compact ? 'wall-cal-share-link--compact' : ''}`}
      target="_blank"
      rel="noopener noreferrer"
      title="Termin teilen: Wer, Wann, Wo"
      aria-label={`Termin ${entry.name} per WhatsApp teilen`}
      onClick={onShareClick}
    >
      WhatsApp teilen
    </a>
  );
}
