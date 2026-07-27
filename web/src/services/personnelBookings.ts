import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { PersonnelBooking, PersonnelBookingDocument } from '../types/personnelBooking';

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

export function parsePersonnelBookingDocument(data: unknown): PersonnelBookingDocument {
  const d = (data ?? {}) as Partial<PersonnelBookingDocument> & { bookings?: unknown };
  return {
    bookings: normalizeBookings(d.bookings),
    updatedAtMs: typeof d.updatedAtMs === 'number' ? d.updatedAtMs : undefined,
  };
}

export async function loadPersonnelBookings(): Promise<PersonnelBookingDocument> {
  if (!db) return { bookings: {} };
  const snap = await getDoc(doc(db, PLAN_DOC[0], PLAN_DOC[1]));
  if (!snap.exists()) return { bookings: {} };
  return parsePersonnelBookingDocument(snap.data());
}

export function subscribePersonnelBookings(
  onData: (doc: PersonnelBookingDocument) => void,
  onError?: (err: Error) => void
): () => void {
  if (!db) {
    onData({ bookings: {} });
    return () => undefined;
  }
  return onSnapshot(
    doc(db, PLAN_DOC[0], PLAN_DOC[1]),
    (snap) => {
      onData(snap.exists() ? parsePersonnelBookingDocument(snap.data()) : { bookings: {} });
    },
    (err) => onError?.(err)
  );
}

export async function savePersonnelBooking(booking: PersonnelBooking): Promise<void> {
  if (!db) throw new Error('Firebase nicht konfiguriert');
  const current = await loadPersonnelBookings();
  const bookings = {
    ...current.bookings,
    [booking.id]: {
      ...booking,
      updatedAtMs: Date.now(),
    },
  };
  await setDoc(
    doc(db, PLAN_DOC[0], PLAN_DOC[1]),
    {
      bookings,
      updatedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deletePersonnelBooking(id: string): Promise<void> {
  if (!db) throw new Error('Firebase nicht konfiguriert');
  const current = await loadPersonnelBookings();
  const bookings = { ...current.bookings };
  delete bookings[id];
  await setDoc(
    doc(db, PLAN_DOC[0], PLAN_DOC[1]),
    {
      bookings,
      updatedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
