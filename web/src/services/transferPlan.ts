import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import type {
  DispositionPlanEvent,
  PlanAssignment,
  PlanDocument,
} from '../planning/types';

const PLAN_DOC = ['settings', 'ueberfuehrungsPlanung'] as const;
const MAX_EVENTS = 40;

function normalizeAssignments(raw: unknown): Record<string, PlanAssignment> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, PlanAssignment> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const v = value as Partial<PlanAssignment>;
    if (!v.docId || typeof v.zeile !== 'number') continue;
    out[id] = {
      id,
      docId: String(v.docId),
      zeile: v.zeile,
      plannedDayKey: v.plannedDayKey === undefined ? null : (v.plannedDayKey as string | null),
      plannedKuehlraumId: v.plannedKuehlraumId ?? null,
      plannedZeit: v.plannedZeit ?? null,
      vonOrt: v.vonOrt ?? null,
      nachOrt: v.nachOrt ?? null,
      schrittTyp: v.schrittTyp ?? null,
      source: v.source === 'canvas' ? 'canvas' : 'alamida',
      order: typeof v.order === 'number' ? v.order : 0,
      updatedAtMs: typeof v.updatedAtMs === 'number' ? v.updatedAtMs : undefined,
    };
  }
  return out;
}

function normalizeEvents(raw: unknown): DispositionPlanEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: DispositionPlanEvent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const v = item as Partial<DispositionPlanEvent>;
    if (!v.id || !v.type || !v.docId) continue;
    out.push({
      id: String(v.id),
      type: v.type,
      docId: String(v.docId),
      sterbefallId: v.sterbefallId,
      name: v.name,
      vonOrt: v.vonOrt,
      nachOrt: v.nachOrt,
      kuehlraumId: v.kuehlraumId,
      plannedDayKey: v.plannedDayKey ?? null,
      plannedZeit: v.plannedZeit ?? null,
      createdAtMs: typeof v.createdAtMs === 'number' ? v.createdAtMs : Date.now(),
    });
  }
  return out;
}

export function parsePlanDocument(data: unknown): PlanDocument {
  const d = (data ?? {}) as Partial<PlanDocument> & {
    assignments?: unknown;
    events?: unknown;
  };
  return {
    assignments: normalizeAssignments(d.assignments),
    events: normalizeEvents(d.events),
    updatedAtMs: typeof d.updatedAtMs === 'number' ? d.updatedAtMs : undefined,
  };
}

export async function loadTransferPlan(): Promise<PlanDocument> {
  if (!db) return { assignments: {}, events: [] };
  const snap = await getDoc(doc(db, PLAN_DOC[0], PLAN_DOC[1]));
  if (!snap.exists()) return { assignments: {}, events: [] };
  return parsePlanDocument(snap.data());
}

export function subscribeTransferPlan(
  onData: (plan: PlanDocument) => void,
  onError?: (err: Error) => void
): () => void {
  if (!db) {
    onData({ assignments: {}, events: [] });
    return () => undefined;
  }
  return onSnapshot(
    doc(db, PLAN_DOC[0], PLAN_DOC[1]),
    (snap) => {
      onData(snap.exists() ? parsePlanDocument(snap.data()) : { assignments: {}, events: [] });
    },
    (err) => onError?.(err)
  );
}

export async function saveTransferPlan(plan: {
  assignments: Record<string, PlanAssignment>;
  events?: DispositionPlanEvent[];
}): Promise<void> {
  if (!db) throw new Error('Firebase nicht konfiguriert');
  const events = (plan.events ?? []).slice(0, MAX_EVENTS);
  await setDoc(
    doc(db, PLAN_DOC[0], PLAN_DOC[1]),
    {
      assignments: plan.assignments,
      events,
      updatedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/** @deprecated Prefer saveTransferPlan */
export async function saveTransferPlanAssignments(
  assignments: Record<string, PlanAssignment>
): Promise<void> {
  const current = await loadTransferPlan();
  await saveTransferPlan({ assignments, events: current.events ?? [] });
}

export async function publishDispositionPlanEvent(
  event: Omit<DispositionPlanEvent, 'id' | 'createdAtMs'> & { id?: string; createdAtMs?: number }
): Promise<DispositionPlanEvent> {
  const full: DispositionPlanEvent = {
    id: event.id ?? `pe_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    type: event.type,
    docId: event.docId,
    sterbefallId: event.sterbefallId,
    name: event.name,
    vonOrt: event.vonOrt,
    nachOrt: event.nachOrt,
    kuehlraumId: event.kuehlraumId,
    plannedDayKey: event.plannedDayKey ?? null,
    plannedZeit: event.plannedZeit ?? null,
    createdAtMs: event.createdAtMs ?? Date.now(),
  };

  if (!db) return full;

  try {
    await addDoc(collection(db, 'dispositionEvents'), {
      ...full,
      type: full.type,
      createdAt: serverTimestamp(),
    });
  } catch {
    /* Rules/collection optional — Plan-Dokument bleibt Quelle der Wahrheit. */
  }

  return full;
}
