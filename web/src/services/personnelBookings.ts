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
  PersonnelStandby,
  PersonnelStandbyExclusion,
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
    confirmedPersonIds:
      booking.confirmedPersonIds && booking.confirmedPersonIds.length > 0
        ? [...new Set(booking.confirmedPersonIds.map(String).filter(Boolean))]
        : undefined,
  });
}

function normalizeHhMm(raw: string | undefined): string | undefined {
  const t = raw?.trim();
  if (!t) return undefined;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  return `${m[1]!.padStart(2, '0')}:${m[2]}`;
}

function sanitizeAbsence(absence: PersonnelAbsence): PersonnelAbsence {
  const note = absence.note?.trim();
  return omitUndefinedDeep({
    ...absence,
    note: note ? note : undefined,
    fromTime: normalizeHhMm(absence.fromTime),
    toTime: normalizeHhMm(absence.toTime),
  });
}

function sanitizeExclusion(ex: PersonnelStandbyExclusion): PersonnelStandbyExclusion | null {
  const fromTime = normalizeHhMm(ex.fromTime);
  const toTime = normalizeHhMm(ex.toTime);
  if (!ex.personId || !ex.dayKey || !fromTime || !toTime) return null;
  return {
    id: ex.id,
    personId: String(ex.personId),
    dayKey: String(ex.dayKey),
    fromTime,
    toTime,
  };
}

function sanitizeStandby(standby: PersonnelStandby): PersonnelStandby {
  const note = standby.note?.trim();
  const exclusions = (standby.exclusions ?? [])
    .map(sanitizeExclusion)
    .filter((e): e is PersonnelStandbyExclusion => e != null);
  return omitUndefinedDeep({
    ...standby,
    personIds: [...new Set(standby.personIds.map(String).filter(Boolean))],
    note: note ? note : undefined,
    exclusions: exclusions.length > 0 ? exclusions : undefined,
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

function sanitizeStandbysMap(
  standbys: Record<string, PersonnelStandby>
): Record<string, PersonnelStandby> {
  const out: Record<string, PersonnelStandby> = {};
  for (const [id, standby] of Object.entries(standbys)) {
    out[id] = sanitizeStandby(standby);
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
      confirmedPersonIds: Array.isArray(v.confirmedPersonIds)
        ? [...new Set(v.confirmedPersonIds.map(String).filter(Boolean))]
        : undefined,
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
      fromTime: normalizeHhMm(
        typeof v.fromTime === 'string' ? v.fromTime : undefined
      ),
      toTime: normalizeHhMm(typeof v.toTime === 'string' ? v.toTime : undefined),
      note: typeof v.note === 'string' && v.note.trim() ? v.note.trim() : undefined,
      updatedAtMs: typeof v.updatedAtMs === 'number' ? v.updatedAtMs : undefined,
    };
  }
  return out;
}

function normalizeExclusions(raw: unknown): PersonnelStandbyExclusion[] {
  if (!Array.isArray(raw)) return [];
  const out: PersonnelStandbyExclusion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const v = item as Partial<PersonnelStandbyExclusion>;
    const fromTime = normalizeHhMm(typeof v.fromTime === 'string' ? v.fromTime : undefined);
    const toTime = normalizeHhMm(typeof v.toTime === 'string' ? v.toTime : undefined);
    if (!v.personId || !v.dayKey || !fromTime || !toTime) continue;
    out.push({
      id: String(v.id ?? `ex-${out.length}`),
      personId: String(v.personId),
      dayKey: String(v.dayKey),
      fromTime,
      toTime,
    });
  }
  return out;
}

function normalizeStandbys(raw: unknown): Record<string, PersonnelStandby> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, PersonnelStandby> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const v = value as Partial<PersonnelStandby>;
    if (!v.fromDayKey || !v.toDayKey) continue;
    const personIds = Array.isArray(v.personIds)
      ? [...new Set(v.personIds.map(String).filter(Boolean))]
      : [];
    if (personIds.length === 0) continue;
    const exclusions = normalizeExclusions(v.exclusions);
    out[id] = {
      id,
      fromDayKey: String(v.fromDayKey),
      toDayKey: String(v.toDayKey),
      personIds,
      exclusions: exclusions.length > 0 ? exclusions : undefined,
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
    standbys?: unknown;
  };
  return {
    bookings: normalizeBookings(d.bookings),
    absences: normalizeAbsences(d.absences),
    standbys: normalizeStandbys(d.standbys),
    updatedAtMs: typeof d.updatedAtMs === 'number' ? d.updatedAtMs : undefined,
  };
}

async function writePersonnelDoc(
  patch: Partial<PersonnelBookingDocument> & {
    bookings?: Record<string, PersonnelBooking>;
    absences?: Record<string, PersonnelAbsence>;
    standbys?: Record<string, PersonnelStandby>;
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
  if (patch.standbys) data.standbys = sanitizeStandbysMap(patch.standbys);

  // updateDoc ersetzt Map-Felder komplett — setDoc({merge:true}) würde gelöschte Keys behalten.
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, data);
  } else {
    await updateDoc(ref, data);
  }
}

const EMPTY_DOC: PersonnelBookingDocument = {
  bookings: {},
  absences: {},
  standbys: {},
};

export async function loadPersonnelBookings(): Promise<PersonnelBookingDocument> {
  if (!db) return { ...EMPTY_DOC };
  const snap = await getDoc(doc(db, PLAN_DOC[0], PLAN_DOC[1]));
  if (!snap.exists()) return { ...EMPTY_DOC };
  return parsePersonnelBookingDocument(snap.data());
}

export function subscribePersonnelBookings(
  onData: (doc: PersonnelBookingDocument) => void,
  onError?: (err: Error) => void
): () => void {
  if (!db) {
    onData({ ...EMPTY_DOC });
    return () => undefined;
  }
  return onSnapshot(
    doc(db, PLAN_DOC[0], PLAN_DOC[1]),
    (snap) => {
      onData(snap.exists() ? parsePersonnelBookingDocument(snap.data()) : { ...EMPTY_DOC });
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
    standbys: current.standbys ?? {},
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
    standbys: current.standbys ?? {},
  });
}

export async function deletePersonnelAbsence(id: string): Promise<void> {
  if (!db) throw new Error('Firebase nicht konfiguriert');
  const ref = doc(db, PLAN_DOC[0], PLAN_DOC[1]);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  await updateDoc(ref, {
    [`absences.${id}`]: deleteField(),
    updatedAtMs: Date.now(),
    updatedAt: serverTimestamp(),
  });
}

export async function savePersonnelStandby(standby: PersonnelStandby): Promise<void> {
  const current = await loadPersonnelBookings();
  await writePersonnelDoc({
    bookings: current.bookings,
    absences: current.absences ?? {},
    standbys: {
      ...(current.standbys ?? {}),
      [standby.id]: { ...standby, updatedAtMs: Date.now() },
    },
  });
}

export async function deletePersonnelStandby(id: string): Promise<void> {
  if (!db) throw new Error('Firebase nicht konfiguriert');
  const ref = doc(db, PLAN_DOC[0], PLAN_DOC[1]);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  await updateDoc(ref, {
    [`standbys.${id}`]: deleteField(),
    updatedAtMs: Date.now(),
    updatedAt: serverTimestamp(),
  });
}

