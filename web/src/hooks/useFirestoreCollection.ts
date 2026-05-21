import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../firebase';

export function useFirestoreCollection<T extends { id: string }>(
  collectionName: string,
  orderField?: string,
  max = 200
) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      setError('Firebase nicht konfiguriert — VITE_FIREBASE_* in .env setzen');
      return;
    }

    const ref = collection(db, collectionName);
    const q = orderField
      ? query(ref, orderBy(orderField, 'desc'), limit(max))
      : query(ref, limit(max));

    const unsub = onSnapshot(
      q,
      (snap) => {
        setItems(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T)
        );
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [collectionName, orderField, max]);

  return { items, loading, error };
}
