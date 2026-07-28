import { parseTimeLabelMinutes } from '../board/personnelBookingRules';
import {
  dayKeyFromDate,
  dayKeyFromDeDatum,
  extractZeitDe,
} from '../board/dateUtils';
import { buildKuehlraumTerminMarkers } from '../board/kuehlraumTerminMarker';
import { getEffectiveAusstehend } from '../board/ausstehendEffective';
import { isAusstehendHeuteOrGeplant } from '../board/ausstehendStatus';
import { matchEigenerKuehlraum } from '../settings/ortMatchers';
import type { Sterbefall } from '../types';
import type { CeremonyInfo, CeremonyKind, SlotFreeEvent } from './types';
import { istKrankenhaus } from '../board/ortKeywords';

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

function funeralCheckoutRank(kind: CeremonyKind | string): number {
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

/** Früheste Ausbuchungszeit heute aus Feierterminen des Falls. */
export function resolveEarliestCheckoutZeitToday(
  s: Sterbefall,
  now = new Date()
): string | null {
  const today = dayKeyFromDate(now);
  const markers = buildKuehlraumTerminMarkers(s, now);
  const ceremonies: CeremonyInfo[] = markers
    .filter(
      (m) =>
        m.kind === 'trauerfeier' || m.kind === 'verabschiedung' || m.kind === 'beisetzung'
    )
    .map((m) => ({
      kind: m.kind,
      datum: m.datum,
      dayKey: dayKeyFromDeDatum(m.datum),
      zeit: m.zeit || extractZeitDe(m.datum) || undefined,
      label: m.label,
      relativeLabel: m.relativeLabel,
    }));
  const host = pickFuneralCeremonyForCheckout(ceremonies, today);
  return earliestKuehlraumCheckoutZeit(host?.zeit);
}

function warImEigenenKuehlraum(s: Sterbefall): boolean {
  if (matchEigenerKuehlraum(s.kuehlraumId)) return true;
  if (matchEigenerKuehlraum(s.aktuellePosition)) return true;
  for (const v of s.verlauf ?? []) {
    if (matchEigenerKuehlraum(v.nachOrt) || matchEigenerKuehlraum(v.ort)) return true;
  }
  for (const a of getEffectiveAusstehend(s)) {
    if (matchEigenerKuehlraum(a.vonOrt)) return true;
  }
  return false;
}

/**
 * Alamida hat den Fall schon aus dem KR „ausgebucht“, Feier ist aber erst später —
 * bis Feier−1h weiter als im Kühlraum führen (Berger/Schantl).
 */
export function shouldHoldInKuehlraumUntilCheckout(
  s: Sterbefall,
  now = new Date()
): boolean {
  const checkoutZeit = resolveEarliestCheckoutZeitToday(s, now);
  if (!checkoutZeit) return false;
  if (!warImEigenenKuehlraum(s)) return false;

  // Noch physisch im KR laut Position → Hold unnötig (normale Belegung greift)
  if (matchEigenerKuehlraum(s.aktuellePosition)) return false;

  // Bereits am Krankenhaus/extern → echte Ausfahrt, kein Feier-Hold
  if (s.aktuellePosition?.trim() && istKrankenhaus(s.aktuellePosition)) return false;

  const earliest = parseTimeLabelMinutes(checkoutZeit);
  if (earliest == null) return false;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  if (nowMins >= earliest) return false;

  // Offene/heute Ausfahrt aus dem KR (nicht zu KH — das ist keine vorzeitige Feier-Ausbuchung)
  const leavesToday = getEffectiveAusstehend(s).some((a) => {
    if (!matchEigenerKuehlraum(a.vonOrt)) return false;
    if (matchEigenerKuehlraum(a.nachOrt)) return false;
    if (a.nachOrt && istKrankenhaus(a.nachOrt)) return false;
    return a.status === 'heute' || isAusstehendHeuteOrGeplant(a);
  });
  if (leavesToday) return true;

  // Verlauf: war im KR, letzte Etappe schon am Friedhof/Feierort
  return (s.verlauf ?? []).some(
    (v) => matchEigenerKuehlraum(v.nachOrt) || matchEigenerKuehlraum(v.ort)
  );
}

/** Ob ein Slot-Frei-Ereignis für die aktuelle Projektion schon zählt (heute erst ab Checkout-Zeit). */
export function isSlotFreeEffectiveForNow(event: SlotFreeEvent, now = new Date()): boolean {
  const today = dayKeyFromDate(now);
  if (event.dayKey !== today) return true;
  const earliest = parseTimeLabelMinutes(event.zeit);
  if (earliest == null) return true;
  return now.getHours() * 60 + now.getMinutes() >= earliest;
}
