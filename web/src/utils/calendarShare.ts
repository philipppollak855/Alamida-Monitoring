import type { WallCalendarEntry } from '../board/wallCalendar';

export function getWallShareUrl(): string {
  if (typeof window === 'undefined') return 'https://alamida---monitoring.web.app/wall';
  return `${window.location.origin}/wall`;
}

/** Text für WhatsApp / Web Share: Wer, Wann, Wo. */
export function formatCalendarEntryShareText(entry: WallCalendarEntry): string {
  const art =
    entry.badges.length > 0 ? entry.badges.join(' · ') : entry.title || 'Termin';
  const wannParts = [entry.dayLabel];
  if (entry.timeLabel && entry.timeLabel !== '—') wannParts.push(entry.timeLabel);
  const wann = wannParts.join(' · ');
  const wo = entry.subtitle?.trim() || '';
  const wer = entry.name?.trim() || '—';

  const lines = [
    'Alamida Monitoring – Termin',
    '',
    `Wer: ${wer}`,
    `Wann: ${wann}`,
    `Wo: ${wo || '—'}`,
    `Art: ${art}`,
    '',
    getWallShareUrl(),
  ];
  return lines.join('\n');
}

export function getWhatsAppShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** PWA: natives Teilen (WhatsApp u. a.), sonst wa.me-Link. */
export async function shareCalendarEntry(entry: WallCalendarEntry): Promise<void> {
  const fullText = formatCalendarEntryShareText(entry);
  const url = getWallShareUrl();
  const bodyWithoutUrl = fullText.replace(/\nhttps?:\/\/\S+\s*$/i, '').trim();

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: `Termin: ${entry.name || artLabel(entry)}`,
        text: `${bodyWithoutUrl}\n`,
        url,
      });
      return;
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
    }
  }

  window.open(getWhatsAppShareUrl(fullText), '_blank', 'noopener,noreferrer');
}

function artLabel(entry: WallCalendarEntry): string {
  return entry.badges[0] ?? entry.title ?? 'Termin';
}
