import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

/** Fall in Disposition/Wandmonitor ausblenden (z. B. Testfälle). Daten bleiben in Firestore. */
export async function removeSterbefallFromDisposition(
  docId: string,
  sterbefallId?: string,
  historieGrund: string = 'manuell_entfernt'
): Promise<void> {
  if (!db) throw new Error('Firebase nicht konfiguriert');

  const ref = doc(db, 'sterbefaelle', docId);
  await updateDoc(ref, {
    inHistory: true,
    aktivInDisposition: false,
    historieGrund,
    archiviertAm: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...(sterbefallId ? { sterbefallId } : {}),
  });
}

/** Mehrere Fälle aus Disposition entfernen (z. B. Duplikatbereinigung). */
export async function removeSterbefaelleFromDisposition(
  items: Array<{ docId: string; sterbefallId?: string }>,
  historieGrund: string = 'duplikat_bereinigt'
): Promise<void> {
  for (const item of items) {
    await removeSterbefallFromDisposition(item.docId, item.sterbefallId, historieGrund);
  }
}
