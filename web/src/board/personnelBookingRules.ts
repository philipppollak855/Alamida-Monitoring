import type { WallCalendarEntry } from '../board/wallCalendar';
import type { DispositionPerson } from '../types/dispositionSettings';
import type {
  PersonnelAbsence,
  PersonnelBooking,
  PersonnelBookingValidation,
  PersonUnavailableReason,
} from '../types/personnelBooking';

export function isBegraebnisEntry(entry: Pick<WallCalendarEntry, 'arts' | 'title'>): boolean {
  return entry.arts.includes('beisetzung') || entry.title === 'Beisetzung';
}

export function isUeberfuehrungEntry(entry: Pick<WallCalendarEntry, 'arts' | 'title'>): boolean {
  if (entry.arts.includes('ueberfuehrung') || entry.arts.includes('ueberfuehrung_kremation')) {
    return true;
  }
  const t = entry.title.trim().toLowerCase();
  return t.includes('überführung') || t.includes('ueberfuehrung') || t === 'abholung';
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

/** Max. Personen (bei Überführung: 2). */
export function maxPersonenForEntry(
  entry: Pick<WallCalendarEntry, 'arts' | 'title'>
): number | null {
  if (isUeberfuehrungEntry(entry)) return 2;
  return null;
}

export function defaultRequiredTraegerCount(
  entry: Pick<WallCalendarEntry, 'arts' | 'title' | 'bestattungsMarker'>,
  traegerVonFamilie: boolean
): number {
  if (isUeberfuehrungEntry(entry)) return 1;
  return minTraegerForEntry(entry, traegerVonFamilie);
}

export function isTraegerOnlyArrangeur(
  personId: string | null | undefined,
  pool: Pick<DispositionPerson, 'id' | 'roles'>[]
): boolean {
  if (!personId) return false;
  const p = pool.find((x) => x.id === personId);
  if (!p) return false;
  return !p.roles.includes('arrangeur') && p.roles.includes('traeger');
}

export function validatePersonnelBooking(
  entry: Pick<WallCalendarEntry, 'arts' | 'title' | 'bestattungsMarker'>,
  draft: Pick<
    PersonnelBooking,
    'arrangeurId' | 'traegerIds' | 'traegerVonFamilie' | 'requiredTraegerCount'
  >,
  pool: Pick<DispositionPerson, 'id' | 'roles'>[] = []
): PersonnelBookingValidation {
  const isBegraebnis = isBegraebnisEntry(entry);
  const isUeberfuehrung = isUeberfuehrungEntry(entry);
  const requiresArrangeur = isBegraebnis;
  const minTraeger = minTraegerForEntry(entry, draft.traegerVonFamilie);
  const maxPersonen = maxPersonenForEntry(entry);
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

  if (isUeberfuehrung) {
    const personen = draft.traegerIds.length + (draft.arrangeurId ? 1 : 0);
    const max = maxPersonen ?? 2;
    if (personen > max) {
      errors.push(`Überführung: maximal ${max} Personen.`);
    }
  }

  if (draft.traegerVonFamilie && draft.traegerIds.length > 0) {
    warnings.push('Träger von Familie aktiv — Firmenträger sind optional.');
  }

  if (draft.arrangeurId && draft.traegerIds.includes(draft.arrangeurId)) {
    errors.push('Eingebuchter Arrangeur steht nicht als Träger zur Verfügung.');
  }

  if (isTraegerOnlyArrangeur(draft.arrangeurId, pool)) {
    warnings.push(
      'Gewählte Person ist nur als Träger hinterlegt — als Arrangeur möglich, aber nicht priorisiert.'
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    minTraeger,
    requiresArrangeur,
    isBegraebnis,
    isUeberfuehrung,
    maxPersonen,
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

/** Träger-IDs an einem Tag (optional ohne eine Buchung). */
export function traegerIdsBookedOnDay(
  bookings: Record<string, Pick<PersonnelBooking, 'dayKey' | 'traegerIds'>>,
  dayKey: string,
  excludeBookingId?: string
): Set<string> {
  const ids = new Set<string>();
  for (const [id, booking] of Object.entries(bookings)) {
    if (excludeBookingId && id === excludeBookingId) continue;
    if (booking.dayKey !== dayKey) continue;
    for (const tid of booking.traegerIds ?? []) ids.add(tid);
  }
  return ids;
}

export function isPersonAbsentOnDay(
  absences: Record<string, Pick<PersonnelAbsence, 'personId' | 'fromDayKey' | 'toDayKey'>>,
  personId: string,
  dayKey: string
): boolean {
  for (const a of Object.values(absences)) {
    if (a.personId !== personId) continue;
    if (a.fromDayKey <= dayKey && dayKey <= a.toDayKey) return true;
  }
  return false;
}

/** Warum eine Person am Tag nicht verfügbar ist (Abwesenheit oder Einbuchung). */
export function personUnavailableReason(
  personId: string,
  dayKey: string,
  opts: {
    absences?: Record<string, Pick<PersonnelAbsence, 'personId' | 'fromDayKey' | 'toDayKey'>>;
    bookings?: Record<
      string,
      Pick<PersonnelBooking, 'dayKey' | 'arrangeurId' | 'traegerIds'>
    >;
    excludeBookingId?: string;
    /** Rolle, für die geprüft wird — Arrangeur-Buchung blockiert Träger. */
    asRole?: 'arrangeur' | 'traeger';
  }
): PersonUnavailableReason | null {
  if (opts.absences && isPersonAbsentOnDay(opts.absences, personId, dayKey)) {
    return 'absent';
  }
  const bookings = opts.bookings ?? {};
  const arrangeurs = arrangeurIdsBookedOnDay(bookings, dayKey, opts.excludeBookingId);
  if (arrangeurs.has(personId)) return 'booked-arrangeur';
  if (opts.asRole === 'traeger') {
    const traeger = traegerIdsBookedOnDay(bookings, dayKey, opts.excludeBookingId);
    if (traeger.has(personId)) return 'booked-traeger';
  }
  return null;
}

export function unavailableReasonLabel(reason: PersonUnavailableReason): string {
  switch (reason) {
    case 'absent':
      return 'Abwesend';
    case 'booked-arrangeur':
      return 'Als Arrangeur eingebucht';
    case 'booked-traeger':
      return 'Als Träger eingebucht';
  }
}

/** Träger-Pool ohne Personen, die als Arrangeur eingebucht / gewählt sind. */
export function availableTraegerPool<T extends { id: string }>(
  traegerPool: T[],
  opts: {
    selectedArrangeurId?: string | null;
    bookedArrangeurIds?: Iterable<string>;
    /** Wenn gesetzt: Abwesende und bereits gebuchte ausfiltern (Legacy). */
    hardFilter?: boolean;
  }
): T[] {
  const blocked = new Set<string>(opts.bookedArrangeurIds ?? []);
  if (opts.selectedArrangeurId) blocked.add(opts.selectedArrangeurId);
  if (blocked.size === 0) return traegerPool;
  return traegerPool.filter((p) => !blocked.has(p.id));
}

export function ceremonyBookingId(docId: string, kind: string, dayKey: string): string {
  return `${docId}:ceremony:${kind}:${dayKey}`;
}

export function findBookingForCeremony(
  bookings: Record<string, PersonnelBooking>,
  docId: string,
  dayKey: string,
  kind: string
): PersonnelBooking | null {
  const exact = bookings[ceremonyBookingId(docId, kind, dayKey)];
  if (exact) return exact;
  return (
    Object.values(bookings).find(
      (b) =>
        b.docId === docId &&
        b.dayKey === dayKey &&
        (b.entryArts.includes(kind as PersonnelBooking['entryArts'][number]) ||
          b.entryTitle.toLowerCase().includes(kind))
    ) ?? null
  );
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
  pool: { id: string; name: string; extern?: boolean }[]
): string | null {
  if (!booking) return null;
  if (booking.traegerVonFamilie) return 'Träger Familie';
  if (booking.traegerIds.length === 0) return null;
  const byId = new Map(pool.map((p) => [p.id, p]));
  const names = booking.traegerIds
    .map((id) => {
      const p = byId.get(id);
      if (!p?.name?.trim()) return '';
      return p.extern ? `${p.name.trim()} (extern)` : p.name.trim();
    })
    .filter(Boolean);
  if (names.length === 0) return `${booking.traegerIds.length} Träger`;
  return names.join(', ');
}
