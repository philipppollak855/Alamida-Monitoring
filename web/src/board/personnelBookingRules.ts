import type { WallCalendarEntry } from '../board/wallCalendar';
import { isFahrerTransferEntry, isKremationTransferEntry, isPureTransferEntry } from '../board/wallCalendar';
import type {
  PersonnelAbsence,
  PersonnelBooking,
  PersonnelBookingValidation,
  PersonUnavailableReason,
} from '../types/personnelBooking';
import type { DispositionPerson } from '../types/dispositionSettings';

/** Konfliktfenster: gleiche Person darf andernorts gebucht werden, außer ±30 Min. */
export const PERSONNEL_TIME_CONFLICT_MINUTES = 30;

function isTransferPersonnelBooking(
  booking: Pick<PersonnelBooking, 'entryArts'>
): boolean {
  return isPureTransferEntry({ arts: booking.entryArts });
}

/** Minuten seit Mitternacht aus „14:00“, „14:00 Uhr“ o. ä. — sonst null. */
export function parseTimeLabelMinutes(timeLabel: string | null | undefined): number | null {
  if (!timeLabel) return null;
  const m = String(timeLabel).match(/(\d{1,2})\s*[:.]\s*(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** true wenn beide Zeiten parsebar und |Δ| ≤ windowMin. */
export function timesConflictWithinMinutes(
  a: string | null | undefined,
  b: string | null | undefined,
  windowMin = PERSONNEL_TIME_CONFLICT_MINUTES
): boolean {
  const ma = parseTimeLabelMinutes(a);
  const mb = parseTimeLabelMinutes(b);
  if (ma == null || mb == null) return false;
  return Math.abs(ma - mb) <= windowMin;
}

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
  draft: Pick<
    PersonnelBooking,
    'arrangeurId' | 'traegerIds' | 'traegerVonFamilie' | 'requiredTraegerCount'
  >,
  opts?: { personnelPool?: DispositionPerson[] }
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
    if (needed > 0 && draft.traegerIds.length < needed) {
      warnings.push(
        `Personal offen: noch ${needed - draft.traegerIds.length} von ${needed} Träger einbuchen` +
          (draft.traegerIds.length === 0 ? ' (Anzahl bereits vorgemerkt).' : '.')
      );
    }
  }

  if (draft.traegerVonFamilie && draft.traegerIds.length > 0) {
    warnings.push('Träger von Familie aktiv — Firmenträger sind optional.');
  }

  if (draft.arrangeurId && draft.traegerIds.includes(draft.arrangeurId)) {
    errors.push('Eingebuchter Arrangeur steht nicht als Träger zur Verfügung.');
  }

  if (draft.arrangeurId && opts?.personnelPool) {
    const person = opts.personnelPool.find((p) => p.id === draft.arrangeurId);
    if (person && !person.roles.includes('arrangeur')) {
      warnings.push(
        `${person.name} ist kein Arrangeur (nur ${person.roles.join('/') || 'ohne Rolle'}) — bitte prüfen.`
      );
    }
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
  absences: Record<
    string,
    Pick<PersonnelAbsence, 'personId' | 'fromDayKey' | 'toDayKey' | 'fromTime' | 'toTime'>
  >,
  personId: string,
  dayKey: string
): boolean {
  for (const a of Object.values(absences)) {
    if (a.personId !== personId) continue;
    if (a.fromDayKey <= dayKey && dayKey <= a.toDayKey) return true;
  }
  return false;
}

/** Tagesindex yyyy-MM-dd → Minuten seit Epoch-ähnlich (nur relative Vergleiche). */
function dayKeyToDayIndex(dayKey: string): number | null {
  const m = dayKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if (!Number.isFinite(t)) return null;
  return Math.floor(t / 86_400_000);
}

function absenceBoundMinutes(
  dayKey: string,
  time: string | null | undefined,
  edge: 'start' | 'end'
): number | null {
  const day = dayKeyToDayIndex(dayKey);
  if (day == null) return null;
  const parsed = parseTimeLabelMinutes(time);
  const mins =
    parsed ?? (edge === 'start' ? 0 : 24 * 60 - 1);
  return day * 1440 + mins;
}

/**
 * Abwesend zur konkreten Uhrzeit?
 * Ohne fromTime/toTime = ganzer Tag. Mit Uhrzeiten nur im angegebenen Fenster.
 * Ohne buchbare Uhrzeit und stundenweise Abwesenheit → konservativ abwesend am Tag.
 */
export function isPersonAbsentAtTime(
  absences: Record<
    string,
    Pick<PersonnelAbsence, 'personId' | 'fromDayKey' | 'toDayKey' | 'fromTime' | 'toTime'>
  >,
  personId: string,
  dayKey: string,
  timeLabel?: string | null
): boolean {
  for (const a of Object.values(absences)) {
    if (a.personId !== personId) continue;
    if (dayKey < a.fromDayKey || dayKey > a.toDayKey) continue;

    const hasHours = Boolean(a.fromTime?.trim() || a.toTime?.trim());
    if (!hasHours) return true;

    const start = absenceBoundMinutes(a.fromDayKey, a.fromTime, 'start');
    const end = absenceBoundMinutes(a.toDayKey, a.toTime, 'end');
    if (start == null || end == null) return true;

    const eventMins = parseTimeLabelMinutes(timeLabel);
    if (eventMins == null) return true; // Termin ohne Zeit → Tag gilt als blockiert

    const point = absenceBoundMinutes(dayKey, timeLabel, 'start');
    if (point == null) return true;
    if (point >= start && point <= end) return true;
  }
  return false;
}

type BookingTimeSlice = Pick<
  PersonnelBooking,
  'dayKey' | 'arrangeurId' | 'traegerIds' | 'timeLabel'
>;

/** Ob Person in einer Buchung vorkommt (Arrangeur, Träger oder Fahrer). */
export function personInBooking(personId: string, booking: BookingTimeSlice): boolean {
  if (!personId) return false;
  if (booking.arrangeurId === personId) return true;
  return (booking.traegerIds ?? []).includes(personId);
}

/**
 * Warum eine Person am Termin nicht verfügbar ist:
 * Abwesenheit, oder Einbuchung am selben Tag innerhalb ±30 Min.
 * Anderes Begräbnis am selben Tag außerhalb des Fensters ist erlaubt.
 */
export function personUnavailableReason(
  personId: string,
  dayKey: string,
  opts: {
    absences?: Record<
      string,
      Pick<PersonnelAbsence, 'personId' | 'fromDayKey' | 'toDayKey' | 'fromTime' | 'toTime'>
    >;
    bookings?: Record<string, BookingTimeSlice>;
    excludeBookingId?: string;
    /** Rolle, für die geprüft wird — nur für Hinweistext. */
    asRole?: 'arrangeur' | 'traeger';
    /** Uhrzeit des aktuellen Termins. */
    timeLabel?: string;
    conflictWindowMinutes?: number;
  }
): PersonUnavailableReason | null {
  if (
    opts.absences &&
    isPersonAbsentAtTime(opts.absences, personId, dayKey, opts.timeLabel)
  ) {
    return 'absent';
  }
  const bookings = opts.bookings ?? {};
  const windowMin = opts.conflictWindowMinutes ?? PERSONNEL_TIME_CONFLICT_MINUTES;
  const currentTime = opts.timeLabel ?? '';

  for (const [id, booking] of Object.entries(bookings)) {
    if (opts.excludeBookingId && id === opts.excludeBookingId) continue;
    if (booking.dayKey !== dayKey) continue;
    if (!personInBooking(personId, booking)) continue;
    if (!timesConflictWithinMinutes(currentTime, booking.timeLabel, windowMin)) continue;
    if (booking.arrangeurId === personId) return 'booked-arrangeur';
    if ((booking.traegerIds ?? []).includes(personId)) return 'booked-traeger';
    return 'booked-overlap';
  }
  return null;
}

export function unavailableReasonLabel(reason: PersonUnavailableReason): string {
  switch (reason) {
    case 'absent':
      return 'Abwesend';
    case 'booked-arrangeur':
      return 'Als Arrangeur eingebucht (±30 Min)';
    case 'booked-traeger':
      return 'Als Träger eingebucht (±30 Min)';
    case 'booked-overlap':
      return 'Bereits eingebucht (±30 Min)';
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

/** Benötigte Trägerzahl aus Regel + vorgemerkter Anzahl. */
export function neededTraegerForBooking(
  entry: Pick<WallCalendarEntry, 'arts' | 'title' | 'bestattungsMarker'>,
  booking: Pick<PersonnelBooking, 'traegerVonFamilie' | 'requiredTraegerCount'>
): number {
  if (booking.traegerVonFamilie) return 0;
  return Math.max(
    minTraegerForEntry(entry, false),
    booking.requiredTraegerCount || 0
  );
}

/** true wenn Arrangeur da, aber Träger noch unter Bedarf (oder gar nicht). */
export function isPersonnelBookingIncomplete(
  entry: Pick<WallCalendarEntry, 'arts' | 'title' | 'bestattungsMarker'>,
  booking: PersonnelBooking | null | undefined
): boolean {
  if (!booking) return true;
  if (isTransferPersonnelBooking(booking)) {
    return booking.traegerIds.length === 0 && !booking.note?.trim();
  }
  if (isBegraebnisEntry(entry)) {
    if (!booking.arrangeurId) return true;
    if (booking.traegerVonFamilie) return false;
    const needed = neededTraegerForBooking(entry, booking);
    return needed > 0 && booking.traegerIds.length < needed;
  }
  return false;
}

/** Feier/Überführung, für die Personal erwartet wird (nicht Kremationsfahrt). */
export function entryExpectsPersonnelBooking(
  entry: Pick<WallCalendarEntry, 'arts' | 'title'>
): boolean {
  if (isKremationTransferEntry(entry)) return false;
  if (isFahrerTransferEntry(entry)) return true;
  if (isBegraebnisEntry(entry)) return true;
  return entry.arts.some(
    (a) =>
      a === 'trauerfeier' ||
      a === 'trauerfeier2' ||
      a === 'verabschiedung' ||
      a === 'beisetzung'
  );
}

/** Eingebuchte Externe ohne Bestätigung. */
export function hasUnconfirmedExternPersonnel(
  booking: PersonnelBooking | null | undefined,
  pool: { id: string; extern?: boolean }[]
): boolean {
  if (!booking) return false;
  const confirmed = new Set(booking.confirmedPersonIds ?? []);
  const byId = new Map(pool.map((p) => [p.id, p]));
  const ids = new Set<string>([
    ...(booking.arrangeurId ? [booking.arrangeurId] : []),
    ...booking.traegerIds,
  ]);
  for (const id of ids) {
    if (byId.get(id)?.extern === true && !confirmed.has(id)) return true;
  }
  return false;
}

export type PersonnelAttention = 'open' | 'confirm';

/**
 * Kalender-Marker: Personal unvollständig (`open`) oder externe Bestätigung fehlt (`confirm`).
 */
export function personnelAttentionForEntry(
  entry: Pick<WallCalendarEntry, 'arts' | 'title' | 'bestattungsMarker'>,
  booking: PersonnelBooking | null | undefined,
  pool: { id: string; extern?: boolean }[]
): PersonnelAttention | null {
  if (isKremationTransferEntry(entry)) return null;
  if (hasUnconfirmedExternPersonnel(booking, pool)) return 'confirm';
  if (
    entryExpectsPersonnelBooking(entry) &&
    isPersonnelBookingIncomplete(entry, booking)
  ) {
    return 'open';
  }
  return null;
}

export function personnelAttentionTitle(kind: PersonnelAttention): string {
  return kind === 'confirm'
    ? 'Externe Bestätigung ausstehend'
    : 'Personal noch nicht vollständig eingebucht';
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
  if (isTransferPersonnelBooking(booking)) {
    if (booking.traegerIds.length > 0) {
      return booking.traegerIds.length === 1
        ? '1 Fahrer'
        : `${booking.traegerIds.length} Fahrer`;
    }
    if (booking.note?.trim()) return booking.note.trim();
    return 'Personal offen';
  }
  const parts: string[] = [];
  if (booking.arrangeurId) parts.push('Arrangeur');
  if (booking.traegerVonFamilie) parts.push('Träger Familie');
  else if (booking.traegerIds.length > 0) parts.push(`${booking.traegerIds.length} Träger`);
  const needed = Math.max(
    booking.requiredTraegerCount || 0,
    0
  );
  if (
    !booking.traegerVonFamilie &&
    needed > 0 &&
    booking.traegerIds.length < needed
  ) {
    parts.push('Personal offen');
  }
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
  // Kein „(extern)“-Suffix in der Kalenderzeile — sonst wirkt es wie Fall-Standort.
  const names = booking.traegerIds
    .map((id) => {
      const p = byId.get(id);
      if (!p?.name?.trim()) return '';
      return p.name.trim();
    })
    .filter(Boolean);
  if (names.length === 0) {
    return isTransferPersonnelBooking(booking)
      ? `${booking.traegerIds.length} Fahrer`
      : `${booking.traegerIds.length} Träger`;
  }
  return names.join(', ');
}

/** Kalenderzeile: Arrangeur + Träger (Namen) bzw. Fahrer bei Überführung. */
export function personnelBookingDisplayLine(
  booking: PersonnelBooking | null | undefined,
  pool: { id: string; name: string; extern?: boolean }[]
): string | null {
  if (!booking) return null;
  if (isTransferPersonnelBooking(booking)) {
    const fahrer = personnelBookingTraegerLine(booking, pool);
    const parts: string[] = [];
    if (fahrer) {
      parts.push(
        booking.traegerIds.length === 1 ? `Fahrer ${fahrer}` : `Fahrer: ${fahrer}`
      );
    } else if (booking.note?.trim()) {
      parts.push(booking.note.trim());
    }
    if (
      isPersonnelBookingIncomplete(
        {
          arts: booking.entryArts,
          title: booking.entryTitle,
          bestattungsMarker: booking.bestattungsMarker,
        },
        booking
      )
    ) {
      parts.push('Personal offen');
    }
    if (hasUnconfirmedExternPersonnel(booking, pool)) {
      parts.push('Bestätigung offen');
    }
    return parts.length > 0 ? parts.join(' · ') : null;
  }
  const byId = new Map(pool.map((p) => [p.id, p]));
  const parts: string[] = [];
  if (booking.arrangeurId) {
    const p = byId.get(booking.arrangeurId);
    if (p?.name?.trim()) {
      parts.push(`Arr. ${p.name.trim()}`);
    } else {
      parts.push('Arrangeur');
    }
  }
  const traeger = personnelBookingTraegerLine(booking, pool);
  if (traeger) parts.push(traeger);
  const entryLike = {
    arts: booking.entryArts,
    title: booking.entryTitle,
    bestattungsMarker: booking.bestattungsMarker,
  };
  if (isPersonnelBookingIncomplete(entryLike, booking)) {
    parts.push('Personal offen');
  }
  if (hasUnconfirmedExternPersonnel(booking, pool)) {
    parts.push('Bestätigung offen');
  }
  if (parts.length === 0 && booking.note?.trim()) return booking.note.trim();
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Findet Personalbuchung für einen Kalendereintrag:
 * exakte ID, Ceremony-ID, oder gleicher Fall/Tag/Art.
 */
export function findBookingForWallEntry(
  bookings: Record<string, PersonnelBooking>,
  entry: {
    id: string;
    docId: string;
    dayKey: string;
    arts: readonly string[];
    title: string;
  }
): PersonnelBooking | null {
  const exact = bookings[entry.id];
  if (exact) return exact;

  for (const art of entry.arts) {
    const kind =
      art === 'ueberfuehrung_kremation'
        ? 'kremation'
        : art === 'beisetzung'
          ? 'beisetzung'
          : art === 'verabschiedung'
            ? 'verabschiedung'
            : art === 'trauerfeier' || art === 'trauerfeier2'
              ? 'trauerfeier'
              : art;
    const ceremony = findBookingForCeremony(bookings, entry.docId, entry.dayKey, kind);
    if (ceremony) return ceremony;
  }

  return (
    Object.values(bookings).find(
      (b) =>
        b.docId === entry.docId &&
        b.dayKey === entry.dayKey &&
        (b.entryArts.some((a) => entry.arts.includes(a)) ||
          entry.arts.some((a) => b.entryTitle.toLowerCase().includes(a)) ||
          b.entryTitle.toLowerCase().includes(entry.title.toLowerCase()))
    ) ?? null
  );
}
