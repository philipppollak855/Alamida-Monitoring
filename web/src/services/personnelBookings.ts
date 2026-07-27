import {
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import type {
  PersonnelAbsence,
  PersonnelBooking,
  PersonnelBookingDocument,
} from '../types/personnelBooking';

const PLAN_DOC = ['settings', 'personaleinsatz'] as const;

/** Firestore akzeptiert kein `undefined` — Felder weglassen. */
export function omitUndefinedDeep<T>(value: T): T {
  if (value === undefined) return value;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => omitUndefinedDeep(item)) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[k] = omitUndefinedDeep(v);
  }
  return out as T;
}

function sanitizeBooking(booking: PersonnelBooking): PersonnelBooking {
  const note = booking.note?.trim();
  return omitUndefinedDeep({
    ...booking,
    note: note ? note : undefined,
    bestattungsMarker: booking.bestattungsMarker || undefined,
  });
}

function sanitizeAbsence(absence: PersonnelAbsence): PersonnelAbsence {
  const note = absence.note?.trim();
  return omitUndefinedDeep({
    ...absence,
    note: note ? note : undefined,
  });
}

function sanitizeBookingsMap(
  bookings: Record<string, PersonnelBooking>
): Record<string, PersonnelBooking> {
  const out: Record<string, PersonnelBooking> = {};
  for (const [id, booking] of Object.entries(bookings)) {
    out[id] = sanitizeBooking(booking);
  }
  return out;
}

function sanitizeAbsencesMap(
  absences: Record<string, PersonnelAbsence>
): Record<string, PersonnelAbsence> {
  const out: Record<string, PersonnelAbsence> = {};
  for (const [id, absence] of Object.entries(absences)) {
    out[id] = sanitizeAbsence(absence);
  }
  return out;
}

function normalizeBookings(raw: unknown): Record<string, PersonnelBooking> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, PersonnelBooking> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const v = value as Partial<PersonnelBooking>;
    if (!v.docId || !v.dayKey) continue;
    out[id] = {
      id,
      docId: String(v.docId),
      sterbefallId: String(v.sterbefallId ?? ''),
      dayKey: String(v.dayKey),
      entryTitle: String(v.entryTitle ?? ''),
      entryArts: Array.isArray(v.entryArts) ? (v.entryArts as PersonnelBooking['entryArts']) : [],
      timeLabel: String(v.timeLabel ?? ''),
      name: String(v.name ?? ''),
      bestattungsMarker: v.bestattungsMarker,
      arrangeurId: v.arrangeurId ?? null,
      traegerIds: Array.isArray(v.traegerIds) ? v.traegerIds.map(String) : [],
      traegerVonFamilie: v.traegerVonFamilie === true,
      requiredTraegerCount:
        typeof v.requiredTraegerCount === 'number' ? v.requiredTraegerCount : 0,
      note: typeof v.note === 'string' && v.note.trim() ? v.note.trim() : undefined,
      updatedAtMs: typeof v.updatedAtMs === 'number' ? v.updatedAtMs : undefined,
    };
  }
  return out;
}

function normalizeAbsences(raw: unknown): Record<string, PersonnelAbsence> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, PersonnelAbsence> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const v = value as Partial<PersonnelAbsence>;
    if (!v.personId || !v.fromDayKey || !v.toDayKey) continue;
    out[id] = {
      id,
      personId: String(v.personId),
      fromDayKey: String(v.fromDayKey),
      toDayKey: String(v.toDayKey),
      note: typeof v.note === 'string' && v.note.trim() ? v.note.trim() : undefined,
      updatedAtMs: typeof v.updatedAtMs === 'number' ? v.updatedAtMs : undefined,
    };
  }
  return out;
}

export function parsePersonnelBookingDocument(data: unknown): PersonnelBookingDocument {
  const d = (data ?? {}) as Partial<PersonnelBookingDocument> & {
    bookings?: unknown;
    absences?: unknown;
  };
  return {
    bookings: normalizeBookings(d.bookings),
    absences: normalizeAbsences(d.absences),
    updatedAtMs: typeof d.updatedAtMs === 'number' ? d.updatedAtMs : undefined,
  };
}

async function writePersonnelDoc(
  patch: Partial<PersonnelBookingDocument> & {
    bookings?: Record<string, PersonnelBooking>;
    absences?: Record<string, PersonnelAbsence>;
  }
): Promise<void> {
  if (!db) throw new Error('Firebase nicht konfiguriert');
  const ref = doc(db, PLAN_DOC[0], PLAN_DOC[1]);
  const data: Record<string, unknown> = {
    updatedAtMs: Date.now(),
    updatedAt: serverTimestamp(),
  };
  if (patch.bookings) data.bookings = sanitizeBookingsMap(patch.bookings);
  if (patch.absences) data.absences = sanitizeAbsencesMap(patch.absences);

  // updateDoc ersetzt Map-Felder komplett — setDoc({merge:true}) würde gelöschte Keys behalten.
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, data);
  } else {
    await updateDoc(ref, data);
  }
}

export async function loadPersonnelBookings(): Promise<PersonnelBookingDocument> {
  if (!db) return { bookings: {}, absences: {} };
  const snap = await getDoc(doc(db, PLAN_DOC[0], PLAN_DOC[1]));
  if (!snap.exists()) return { bookings: {}, absences: {} };
  return parsePersonnelBookingDocument(snap.data());
}

export function subscribePersonnelBookings(
  onData: (doc: PersonnelBookingDocument) => void,
  onError?: (err: Error) => void
): () => void {
  if (!db) {
    onData({ bookings: {}, absences: {} });
    return () => undefined;
  }
  return onSnapshot(
    doc(db, PLAN_DOC[0], PLAN_DOC[1]),
    (snap) => {
      onData(snap.exists() ? parsePersonnelBookingDocument(snap.data()) : { bookings: {}, absences: {} });
    },
    (err) => onError?.(err)
  );
}

export async function savePersonnelBooking(booking: PersonnelBooking): Promise<void> {
  const current = await loadPersonnelBookings();
  await writePersonnelDoc({
    bookings: {
      ...current.bookings,
      [booking.id]: { ...booking, updatedAtMs: Date.now() },
    },
    absences: current.absences ?? {},
  });
}

export async function deletePersonnelBooking(id: string): Promise<void> {
  if (!db) throw new Error('Firebase nicht konfiguriert');
  const ref = doc(db, PLAN_DOC[0], PLAN_DOC[1]);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  await updateDoc(ref, {
    [`bookings.${id}`]: deleteField(),
    updatedAtMs: Date.now(),
    updatedAt: serverTimestamp(),
  });
}

export async function savePersonnelAbsence(absence: PersonnelAbsence): Promise<void> {
  const current = await loadPersonnelBookings();
  await writePersonnelDoc({
    bookings: current.bookings,
    absences: {
      ...(current.absences ?? {}),
      [absence.id]: { ...absence, updatedAtMs: Date.now() },
    },
  });
}

export async function deletePersonnelAbsence(id: string): Promise<void> {
  if (!db) throw new Error('Firebase nicht konfiguriert');
  const ref = doc(db, PLAN_DOC[0], PLAN_DOC[1]);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  // Explizites deleteField — merge würde den Key sonst wiederherstellen.
  await updateDoc(ref, {
    [`absences.${id}`]: deleteField(),
    updatedAtMs: Date.now(),
    updatedAt: serverTimestamp(),
  });
}
