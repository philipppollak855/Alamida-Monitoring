import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type { PlanAssignment, PlanDocument } from '../planning/types';

const PLAN_DOC = ['settings', 'ueberfuehrungsPlanung'] as const;

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
      order: typeof v.order === 'number' ? v.order : 0,
      updatedAtMs: typeof v.updatedAtMs === 'number' ? v.updatedAtMs : undefined,
    };
  }
  return out;
}

export function parsePlanDocument(data: unknown): PlanDocument {
  const d = (data ?? {}) as Partial<PlanDocument> & { assignments?: unknown };
  return {
    assignments: normalizeAssignments(d.assignments),
    updatedAtMs: typeof d.updatedAtMs === 'number' ? d.updatedAtMs : undefined,
  };
}

export async function loadTransferPlan(): Promise<PlanDocument> {
  if (!db) return { assignments: {} };
  const snap = await getDoc(doc(db, PLAN_DOC[0], PLAN_DOC[1]));
  if (!snap.exists()) return { assignments: {} };
  return parsePlanDocument(snap.data());
}

export function subscribeTransferPlan(
  onData: (plan: PlanDocument) => void,
  onError?: (err: Error) => void
): () => void {
  if (!db) {
    onData({ assignments: {} });
    return () => undefined;
  }
  return onSnapshot(
    doc(db, PLAN_DOC[0], PLAN_DOC[1]),
    (snap) => {
      onData(snap.exists() ? parsePlanDocument(snap.data()) : { assignments: {} });
    },
    (err) => onError?.(err)
  );
}

export async function saveTransferPlanAssignments(
  assignments: Record<string, PlanAssignment>
): Promise<void> {
  if (!db) throw new Error('Firebase nicht konfiguriert');
  await setDoc(
    doc(db, PLAN_DOC[0], PLAN_DOC[1]),
    {
      assignments,
      updatedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
