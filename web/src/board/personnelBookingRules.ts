import type { WallCalendarEntry } from '../board/wallCalendar';
import type { PersonnelBooking, PersonnelBookingValidation } from '../types/personnelBooking';

export function isBegraebnisEntry(entry: Pick<WallCalendarEntry, 'arts' | 'title'>): boolean {
  return entry.arts.includes('beisetzung') || entry.title === 'Beisetzung';
}

/**
 * Mindest-Trägeranzahl:
 * - Begräbnis + Sarg + keine Träger von Familie → mind. 4
 * - sonst 0 (Anzahl dann variabel/optional)
 */
export function minTraegerForEntry(
  entry: Pick<WallCalendarEntry, 'arts' | 'title' | 'bestattungsMarker'>,
  traegerVonFamilie: boolean
): number {
  if (!isBegraebnisEntry(entry)) return 0;
  if (traegerVonFamilie) return 0;
  if (entry.bestattungsMarker === 'S') return 4;
  return 0;
}

export function defaultRequiredTraegerCount(
  entry: Pick<WallCalendarEntry, 'arts' | 'title' | 'bestattungsMarker'>,
  traegerVonFamilie: boolean
): number {
  return minTraegerForEntry(entry, traegerVonFamilie);
}

export function validatePersonnelBooking(
  entry: Pick<WallCalendarEntry, 'arts' | 'title' | 'bestattungsMarker'>,
  draft: Pick<PersonnelBooking, 'arrangeurId' | 'traegerIds' | 'traegerVonFamilie' | 'requiredTraegerCount'>
): PersonnelBookingValidation {
  const isBegraebnis = isBegraebnisEntry(entry);
  const requiresArrangeur = isBegraebnis;
  const minTraeger = minTraegerForEntry(entry, draft.traegerVonFamilie);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (requiresArrangeur && !draft.arrangeurId) {
    errors.push('Begräbnis braucht einen Arrangeur.');
  }

  if (isBegraebnis && !draft.traegerVonFamilie) {
    const needed = Math.max(minTraeger, draft.requiredTraegerCount || 0);
    if (minTraeger > 0 && draft.traegerIds.length < minTraeger) {
      errors.push(
        `Sarg-Begräbnis ohne Träger von Familie: mindestens ${minTraeger} Träger einbuchen.`
      );
    } else if (needed > 0 && draft.traegerIds.length < needed) {
      errors.push(`Bitte ${needed} Träger einbuchen (aktuell ${draft.traegerIds.length}).`);
    }
  }

  if (draft.traegerVonFamilie && draft.traegerIds.length > 0) {
    warnings.push('Träger von Familie aktiv — Firmenträger sind optional.');
  }

  if (draft.arrangeurId && draft.traegerIds.includes(draft.arrangeurId)) {
    errors.push('Eingebuchter Arrangeur steht nicht als Träger zur Verfügung.');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    minTraeger,
    requiresArrangeur,
    isBegraebnis,
  };
}

/** Arrangeur-IDs an einem Tag (optional ohne eine Buchung). */
export function arrangeurIdsBookedOnDay(
  bookings: Record<string, Pick<PersonnelBooking, 'dayKey' | 'arrangeurId'>>,
  dayKey: string,
  excludeBookingId?: string
): Set<string> {
  const ids = new Set<string>();
  for (const [id, booking] of Object.entries(bookings)) {
    if (excludeBookingId && id === excludeBookingId) continue;
    if (booking.dayKey !== dayKey) continue;
    if (booking.arrangeurId) ids.add(booking.arrangeurId);
  }
  return ids;
}

/** Träger-Pool ohne Personen, die als Arrangeur eingebucht / gewählt sind. */
export function availableTraegerPool<T extends { id: string }>(
  traegerPool: T[],
  opts: {
    selectedArrangeurId?: string | null;
    bookedArrangeurIds?: Iterable<string>;
  }
): T[] {
  const blocked = new Set<string>(opts.bookedArrangeurIds ?? []);
  if (opts.selectedArrangeurId) blocked.add(opts.selectedArrangeurId);
  if (blocked.size === 0) return traegerPool;
  return traegerPool.filter((p) => !blocked.has(p.id));
}

export function personnelBookingSummary(booking: PersonnelBooking | null | undefined): string | null {
  if (!booking) return null;
  const parts: string[] = [];
  if (booking.arrangeurId) parts.push('Arrangeur');
  if (booking.traegerVonFamilie) parts.push('Träger Familie');
  else if (booking.traegerIds.length > 0) parts.push(`${booking.traegerIds.length} Träger`);
  return parts.length > 0 ? parts.join(' · ') : 'Personal offen';
}

/** Kleine Zeile unter dem Kalendertermin: Trägernamen (oder „Träger Familie“). */
export function personnelBookingTraegerLine(
  booking: PersonnelBooking | null | undefined,
  pool: { id: string; name: string }[]
): string | null {
  if (!booking) return null;
  if (booking.traegerVonFamilie) return 'Träger Familie';
  if (booking.traegerIds.length === 0) return null;
  const byId = new Map(pool.map((p) => [p.id, p.name]));
  const names = booking.traegerIds
    .map((id) => (byId.get(id) ?? '').trim())
    .filter(Boolean);
  if (names.length === 0) return `${booking.traegerIds.length} Träger`;
  return names.join(', ');
}
