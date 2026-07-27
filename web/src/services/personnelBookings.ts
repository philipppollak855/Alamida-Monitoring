import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type {
  PersonnelAbsence,
  PersonnelBooking,
  PersonnelBookingDocument,
} from '../types/personnelBooking';

const PLAN_DOC = ['settings', 'personaleinsatz'] as const;

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
      note: v.note,
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
      note: typeof v.note === 'string' ? v.note : undefined,
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
  await setDoc(
    doc(db, PLAN_DOC[0], PLAN_DOC[1]),
    {
      ...patch,
      updatedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
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
  const current = await loadPersonnelBookings();
  const bookings = { ...current.bookings };
  delete bookings[id];
  await writePersonnelDoc({
    bookings,
    absences: current.absences ?? {},
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
  const current = await loadPersonnelBookings();
  const absences = { ...(current.absences ?? {}) };
  delete absences[id];
  await writePersonnelDoc({
    bookings: current.bookings,
    absences,
  });
}
