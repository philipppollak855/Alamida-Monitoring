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
import { omitUndefinedDeep } from './personnelBookings';
import type {
  AttachedCeremonyRef,
  CeremonyKind,
  DispositionPlanEvent,
  PlanAssignment,
  PlanAssignmentSnapshot,
  PlanDocument,
} from '../planning/types';

const PLAN_DOC = ['settings', 'ueberfuehrungsPlanung'] as const;
const MAX_EVENTS = 40;

const CEREMONY_KINDS: CeremonyKind[] = [
  'kremation',
  'beisetzung',
  'trauerfeier',
  'verabschiedung',
];

function normalizeAttachedCeremony(raw: unknown): AttachedCeremonyRef | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Partial<AttachedCeremonyRef>;
  if (!v.dayKey || !v.kind || !CEREMONY_KINDS.includes(v.kind as CeremonyKind)) return null;
  return { kind: v.kind as CeremonyKind, dayKey: String(v.dayKey) };
}

function normalizeSnapshot(raw: unknown): PlanAssignmentSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Partial<PlanAssignmentSnapshot>;
  if (v.plannedDayKey === undefined && typeof v.order !== 'number') return null;
  return omitUndefinedDeep({
    plannedDayKey: (v.plannedDayKey ?? null) as string | null,
    plannedKuehlraumId: v.plannedKuehlraumId ?? null,
    plannedZeit: v.plannedZeit ?? null,
    vonOrt: v.vonOrt ?? null,
    nachOrt: v.nachOrt ?? null,
    schrittTyp: v.schrittTyp ?? null,
    order: typeof v.order === 'number' ? v.order : 0,
    attachedCeremony: normalizeAttachedCeremony(v.attachedCeremony),
    kremationGroupId:
      typeof v.kremationGroupId === 'string' && v.kremationGroupId.trim()
        ? v.kremationGroupId.trim()
        : null,
  }) as PlanAssignmentSnapshot;
}

function normalizeEventSnapshot(
  raw: unknown
): (PlanAssignmentSnapshot & { zeile?: number; source?: 'alamida' | 'canvas' }) | null {
  const base = normalizeSnapshot(raw);
  if (!base || !raw || typeof raw !== 'object') return null;
  const v = raw as { zeile?: number; source?: string };
  const out: PlanAssignmentSnapshot & { zeile?: number; source?: 'alamida' | 'canvas' } = {
    ...base,
  };
  if (typeof v.zeile === 'number') out.zeile = v.zeile;
  if (v.source === 'alamida' || v.source === 'canvas') out.source = v.source;
  return out;
}

function normalizeAssignments(raw: unknown): Record<string, PlanAssignment> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, PlanAssignment> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const v = value as Partial<PlanAssignment>;
    if (!v.docId || typeof v.zeile !== 'number') continue;
    const assignment: PlanAssignment = {
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
    };
    if (typeof v.updatedAtMs === 'number') assignment.updatedAtMs = v.updatedAtMs;
    if (v.previous && typeof v.previous === 'object') {
      assignment.previous = normalizeSnapshot(v.previous);
    }
    const attached = normalizeAttachedCeremony(v.attachedCeremony);
    if (attached) assignment.attachedCeremony = attached;
    if (v.detachedFromCeremony === true) assignment.detachedFromCeremony = true;
    if (typeof v.kremationGroupId === 'string' && v.kremationGroupId.trim()) {
      assignment.kremationGroupId = v.kremationGroupId.trim();
    }
    out[id] = omitUndefinedDeep(assignment);
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
    const event: DispositionPlanEvent = {
      id: String(v.id),
      type: v.type,
      docId: String(v.docId),
      plannedDayKey: v.plannedDayKey ?? null,
      plannedZeit: v.plannedZeit ?? null,
      createdAtMs: typeof v.createdAtMs === 'number' ? v.createdAtMs : Date.now(),
    };
    if (v.sterbefallId) event.sterbefallId = String(v.sterbefallId);
    if (v.name) event.name = String(v.name);
    if (v.vonOrt) event.vonOrt = String(v.vonOrt);
    if (v.nachOrt) event.nachOrt = String(v.nachOrt);
    if (v.kuehlraumId) event.kuehlraumId = String(v.kuehlraumId);
    if (v.assignmentId) event.assignmentId = String(v.assignmentId);
    const prev = normalizeSnapshot(v.previousSnapshot);
    if (prev) event.previousSnapshot = prev;
    const snap = normalizeEventSnapshot(v.snapshot);
    if (snap) event.snapshot = snap;
    out.push(omitUndefinedDeep(event) as DispositionPlanEvent);
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
    omitUndefinedDeep({
      assignments: plan.assignments,
      events,
      updatedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    }),
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
  const full = omitUndefinedDeep({
    id: event.id ?? `pe_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    type: event.type,
    docId: event.docId,
    sterbefallId: event.sterbefallId || undefined,
    name: event.name || undefined,
    vonOrt: event.vonOrt || undefined,
    nachOrt: event.nachOrt || undefined,
    kuehlraumId: event.kuehlraumId || undefined,
    assignmentId: event.assignmentId || undefined,
    plannedDayKey: event.plannedDayKey ?? null,
    plannedZeit: event.plannedZeit ?? null,
    previousSnapshot: event.previousSnapshot ?? null,
    snapshot: event.snapshot ?? null,
    createdAtMs: event.createdAtMs ?? Date.now(),
  }) as DispositionPlanEvent;

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
