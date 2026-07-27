import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import {
  deletePersonnelBooking,
  loadPersonnelBookings,
  savePersonnelBooking,
} from './personnelBookings';
import { loadTransferPlan, saveTransferPlan } from './transferPlan';
import { loadZusatzTermine, saveZusatzTermin } from './zusatzTermine';
import type { PlanAssignment } from '../planning/types';

/** Fall in Disposition/Wandmonitor ausblenden (z. B. Testfälle). Daten bleiben in Firestore. */
export async function removeSterbefallFromDisposition(
  docId: string,
  sterbefallId?: string,
  historieGrund: string = 'manuell_entfernt'
): Promise<void> {
  if (!db) throw new Error('Firebase nicht konfiguriert');

  const batch = writeBatch(db);
  batch.update(doc(db, 'sterbefaelle', docId), {
    inHistory: true,
    aktivInDisposition: false,
    historieGrund,
    archiviertAm: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...(sterbefallId ? { sterbefallId } : {}),
  });
  await batch.commit();
}

/**
 * Mehrere Fälle aus Disposition entfernen (z. B. Duplikatbereinigung).
 * Optional: Personal-/Überführungsplanung und Zusatztermine von remove → keep umhängen.
 */
export async function removeSterbefaelleFromDisposition(
  items: Array<{ docId: string; sterbefallId?: string }>,
  historieGrund: string = 'duplikat_bereinigt',
  opts?: { keepDocId?: string | null; keepSterbefallId?: string | null }
): Promise<void> {
  if (!db) throw new Error('Firebase nicht konfiguriert');
  if (items.length === 0) return;

  const removeIds = items.map((i) => i.docId);
  if (opts?.keepDocId) {
    await reassignPlanningFromRemovedDocs({
      removeDocIds: removeIds,
      keepDocId: opts.keepDocId,
      keepSterbefallId: opts.keepSterbefallId ?? opts.keepDocId,
    });
  }

  const batch = writeBatch(db);
  for (const item of items) {
    batch.update(doc(db, 'sterbefaelle', item.docId), {
      inHistory: true,
      aktivInDisposition: false,
      historieGrund,
      archiviertAm: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...(item.sterbefallId ? { sterbefallId: item.sterbefallId } : {}),
    });
  }
  await batch.commit();
}

/** Hängt Buchungen/Planungen vom entfernten Fall auf den behaltenen um. */
export async function reassignPlanningFromRemovedDocs(opts: {
  removeDocIds: string[];
  keepDocId: string;
  keepSterbefallId: string;
}): Promise<void> {
  const remove = new Set(opts.removeDocIds.filter((id) => id !== opts.keepDocId));
  if (remove.size === 0) return;

  try {
    const personnel = await loadPersonnelBookings();
    for (const [id, booking] of Object.entries(personnel.bookings)) {
      if (!remove.has(booking.docId)) continue;
      const nextId = id.includes(booking.docId)
        ? id.split(booking.docId).join(opts.keepDocId)
        : id;
      await savePersonnelBooking({
        ...booking,
        id: nextId,
        docId: opts.keepDocId,
        sterbefallId: opts.keepSterbefallId || booking.sterbefallId,
      });
      if (nextId !== id) {
        await deletePersonnelBooking(id);
      }
    }
  } catch {
    /* Personal optional */
  }

  try {
    const plan = await loadTransferPlan();
    let planChanged = false;
    const nextAssignments: Record<string, PlanAssignment> = { ...plan.assignments };
    for (const [id, assignment] of Object.entries(plan.assignments)) {
      if (!remove.has(assignment.docId)) continue;
      const nextId = id.includes(assignment.docId)
        ? id.split(assignment.docId).join(opts.keepDocId)
        : `${opts.keepDocId}:canvas:migrated_${Date.now().toString(36)}`;
      delete nextAssignments[id];
      if (!nextAssignments[nextId]) {
        nextAssignments[nextId] = {
          ...assignment,
          id: nextId,
          docId: opts.keepDocId,
          updatedAtMs: Date.now(),
        };
      }
      planChanged = true;
    }
    if (planChanged) {
      await saveTransferPlan({
        assignments: nextAssignments,
        events: plan.events ?? [],
      });
    }
  } catch {
    /* Plan optional */
  }

  try {
    const zusatz = await loadZusatzTermine();
    for (const termin of Object.values(zusatz.termine)) {
      if (!remove.has(termin.docId)) continue;
      await saveZusatzTermin({
        ...termin,
        docId: opts.keepDocId,
        sterbefallId: opts.keepSterbefallId || termin.sterbefallId,
      });
    }
  } catch {
    /* Zusatz optional */
  }
}
