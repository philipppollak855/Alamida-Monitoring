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
import {
  isZusatzTerminArt,
  type ZusatzTermin,
  type ZusatzTermineDocument,
} from '../types/zusatzTermin';

const PLAN_DOC = ['settings', 'zusatzTermine'] as const;

function normalizeTermine(raw: unknown): Record<string, ZusatzTermin> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, ZusatzTermin> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const v = value as Partial<ZusatzTermin>;
    if (!v.dayKey || !v.title?.trim()) continue;
    const art = isZusatzTerminArt(v.art) ? v.art : 'sonstiges';
    const docId = v.docId != null ? String(v.docId).trim() : '';
    // Graben ohne Fall verwerfen; Sonstiges ohne Fall erlauben
    if (!docId && art === 'graben') continue;
    const title = String(v.title).trim();
    out[id] = {
      id,
      docId,
      sterbefallId: String(v.sterbefallId ?? '').trim(),
      name: String(v.name ?? '').trim() || title,
      art,
      title,
      dayKey: String(v.dayKey),
      zeit: v.zeit?.trim() || undefined,
      ort: v.ort?.trim() || undefined,
      note: v.note?.trim() || undefined,
      updatedAtMs: typeof v.updatedAtMs === 'number' ? v.updatedAtMs : undefined,
    };
  }
  return out;
}

export function parseZusatzTermineDocument(data: unknown): ZusatzTermineDocument {
  const d = (data ?? {}) as Partial<ZusatzTermineDocument> & { termine?: unknown };
  return {
    termine: normalizeTermine(d.termine),
    updatedAtMs: typeof d.updatedAtMs === 'number' ? d.updatedAtMs : undefined,
  };
}

/** Firestore verbietet `undefined` — optionale Felder weglassen. */
export function serializeZusatzTermin(termin: ZusatzTermin): Record<string, string | number> {
  const out: Record<string, string | number> = {
    id: termin.id,
    docId: termin.docId ?? '',
    sterbefallId: termin.sterbefallId ?? '',
    name: termin.name ?? '',
    art: termin.art,
    title: termin.title,
    dayKey: termin.dayKey,
  };
  if (termin.zeit?.trim()) out.zeit = termin.zeit.trim();
  if (termin.ort?.trim()) out.ort = termin.ort.trim();
  if (termin.note?.trim()) out.note = termin.note.trim();
  if (typeof termin.updatedAtMs === 'number') out.updatedAtMs = termin.updatedAtMs;
  return out;
}

function serializeTermineMap(
  termine: Record<string, ZusatzTermin>
): Record<string, Record<string, string | number>> {
  const out: Record<string, Record<string, string | number>> = {};
  for (const [id, t] of Object.entries(termine)) {
    out[id] = serializeZusatzTermin(t);
  }
  return out;
}

export async function loadZusatzTermine(): Promise<ZusatzTermineDocument> {
  if (!db) return { termine: {} };
  const snap = await getDoc(doc(db, PLAN_DOC[0], PLAN_DOC[1]));
  if (!snap.exists()) return { termine: {} };
  return parseZusatzTermineDocument(snap.data());
}

export function subscribeZusatzTermine(
  onData: (doc: ZusatzTermineDocument) => void,
  onError?: (err: Error) => void
): () => void {
  if (!db) {
    onData({ termine: {} });
    return () => undefined;
  }
  return onSnapshot(
    doc(db, PLAN_DOC[0], PLAN_DOC[1]),
    (snap) => {
      onData(snap.exists() ? parseZusatzTermineDocument(snap.data()) : { termine: {} });
    },
    (err) => onError?.(err)
  );
}

export async function saveZusatzTermin(termin: ZusatzTermin): Promise<void> {
  if (!db) throw new Error('Firebase nicht konfiguriert');
  const ref = doc(db, PLAN_DOC[0], PLAN_DOC[1]);
  const current = await loadZusatzTermine();
  const next: Record<string, ZusatzTermin> = {
    ...current.termine,
    [termin.id]: {
      ...termin,
      updatedAtMs: Date.now(),
    },
  };
  const data = {
    termine: serializeTermineMap(next),
    updatedAtMs: Date.now(),
    updatedAt: serverTimestamp(),
  };
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, data);
  } else {
    await updateDoc(ref, data);
  }
}

export async function deleteZusatzTermin(id: string): Promise<void> {
  if (!db) throw new Error('Firebase nicht konfiguriert');
  const ref = doc(db, PLAN_DOC[0], PLAN_DOC[1]);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  await updateDoc(ref, {
    [`termine.${id}`]: deleteField(),
    updatedAtMs: Date.now(),
    updatedAt: serverTimestamp(),
  });
}
