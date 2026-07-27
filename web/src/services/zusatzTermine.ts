import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
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
    if (!v.docId || !v.dayKey || !v.title?.trim()) continue;
    const art = isZusatzTerminArt(v.art) ? v.art : 'sonstiges';
    out[id] = {
      id,
      docId: String(v.docId),
      sterbefallId: String(v.sterbefallId ?? ''),
      name: String(v.name ?? ''),
      art,
      title: String(v.title).trim(),
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
  const current = await loadZusatzTermine();
  const termine = {
    ...current.termine,
    [termin.id]: {
      ...termin,
      updatedAtMs: Date.now(),
    },
  };
  await setDoc(
    doc(db, PLAN_DOC[0], PLAN_DOC[1]),
    {
      termine,
      updatedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deleteZusatzTermin(id: string): Promise<void> {
  if (!db) throw new Error('Firebase nicht konfiguriert');
  const current = await loadZusatzTermine();
  const termine = { ...current.termine };
  delete termine[id];
  await setDoc(
    doc(db, PLAN_DOC[0], PLAN_DOC[1]),
    {
      termine,
      updatedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
