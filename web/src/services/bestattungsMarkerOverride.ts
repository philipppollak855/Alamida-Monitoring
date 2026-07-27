import { deleteField, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import type { BestattungsMarker } from '../board/feierterminLogic';
import { db } from '../firebase';

/** Manuell Sarg/Urne setzen — überschreibt Automatik. `null` = Automatik wiederherstellen. */
export async function setSterbefallBestattungsMarkerOverride(
  docId: string,
  marker: BestattungsMarker | null
): Promise<void> {
  if (!db) throw new Error('Firebase nicht konfiguriert');
  const ref = doc(db, 'sterbefaelle', docId);
  if (marker === 'S' || marker === 'U') {
    await updateDoc(ref, {
      bestattungsMarkerOverride: marker,
      updatedAt: serverTimestamp(),
    });
    return;
  }
  await updateDoc(ref, {
    bestattungsMarkerOverride: deleteField(),
    updatedAt: serverTimestamp(),
  });
}
