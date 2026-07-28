import { parseTimeLabelMinutes } from '../board/personnelBookingRules';
import { dayKeyFromDate } from '../board/dateUtils';
import type { CeremonyInfo, CeremonyKind, SlotFreeEvent } from './types';

/** Frühester Kühlraum-Abgang: 1 Stunde vor Trauerfeier/Beisetzung/Verabschiedung. */
export const KUEHLRAUM_CHECKOUT_LEAD_MINUTES = 60;

function formatMinutesAsZeit(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, totalMinutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Trauerfeier 14:00 → Ausbuchung ab 13:00. */
export function earliestKuehlraumCheckoutZeit(
  ceremonyZeit: string | null | undefined
): string | null {
  const mins = parseTimeLabelMinutes(ceremonyZeit);
  if (mins == null) return null;
  return formatMinutesAsZeit(mins - KUEHLRAUM_CHECKOUT_LEAD_MINUTES);
}

export function isKuehlraumCheckoutZeitAllowed(
  plannedZeit: string | null | undefined,
  ceremonyZeit: string | null | undefined
): boolean {
  const earliest = earliestKuehlraumCheckoutZeit(ceremonyZeit);
  if (earliest == null) return true;
  const planned = parseTimeLabelMinutes(plannedZeit);
  if (planned == null) return true;
  return planned >= (parseTimeLabelMinutes(earliest) ?? 0);
}

/** Zu frühe Planzeiten auf frühesten Checkout anheben; ohne Planzeit → frühester Checkout. */
export function clampKuehlraumCheckoutZeit(
  plannedZeit: string | null | undefined,
  ceremonyZeit: string | null | undefined
): string | null {
  const earliest = earliestKuehlraumCheckoutZeit(ceremonyZeit);
  if (earliest == null) {
    const t = plannedZeit?.trim();
    return t || null;
  }
  const planned = parseTimeLabelMinutes(plannedZeit);
  if (planned == null) return earliest;
  const earliestMins = parseTimeLabelMinutes(earliest) ?? 0;
  if (planned < earliestMins) return earliest;
  return formatMinutesAsZeit(planned);
}

function funeralCheckoutRank(kind: CeremonyKind): number {
  if (kind === 'trauerfeier') return 3;
  if (kind === 'verabschiedung') return 2;
  if (kind === 'beisetzung') return 1;
  return 0;
}

/**
 * Feiertermin, an dem die Ausbuchung hängt (mit Uhrzeit bevorzugt).
 * Trauerfeier vor Verabschiedung vor Beisetzung — Im-Anschluss nutzt die TF-Uhrzeit.
 */
export function pickFuneralCeremonyForCheckout(
  ceremonies: CeremonyInfo[],
  dayKey: string
): CeremonyInfo | null {
  const candidates = ceremonies.filter(
    (c) =>
      c.dayKey === dayKey &&
      (c.kind === 'trauerfeier' || c.kind === 'verabschiedung' || c.kind === 'beisetzung')
  );
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const za = a.zeit?.trim() ? 1 : 0;
    const zb = b.zeit?.trim() ? 1 : 0;
    if (zb !== za) return zb - za;
    return funeralCheckoutRank(b.kind) - funeralCheckoutRank(a.kind);
  })[0]!;
}

/** Ob ein Slot-Frei-Ereignis für die aktuelle Projektion schon zählt (heute erst ab Checkout-Zeit). */
export function isSlotFreeEffectiveForNow(event: SlotFreeEvent, now = new Date()): boolean {
  const today = dayKeyFromDate(now);
  if (event.dayKey !== today) return true;
  const earliest = parseTimeLabelMinutes(event.zeit);
  if (earliest == null) return true;
  return now.getHours() * 60 + now.getMinutes() >= earliest;
}
