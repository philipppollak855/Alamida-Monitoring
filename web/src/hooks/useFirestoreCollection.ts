import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  type Query,
  type DocumentData,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { db } from '../firebase';

export function useFirestoreCollection<T extends { id: string }>(
  collectionName: string,
  orderField?: string,
  max = 200
) {
  const { status } = useAuth();
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [reconnectTick, setReconnectTick] = useState(0);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setReconnectTick((t) => t + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    if (status !== 'activated') {
      setItems([]);
      setLoading(status === 'loading');
      setLastSyncAt(null);
      if (status === 'anonymous') setError(null);
      return;
    }

    if (!db) {
      setLoading(false);
      setError('Firebase nicht konfiguriert — VITE_FIREBASE_* in .env setzen');
      return;
    }

    setLoading(true);
    const ref = collection(db, collectionName);
    let q: Query<DocumentData> = orderField
      ? query(ref, orderBy(orderField, 'desc'), limit(max))
      : query(ref, limit(max));

    const unsub = onSnapshot(
      q,
      { includeMetadataChanges: false },
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
        setLastSyncAt(new Date());
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [collectionName, orderField, max, status, reconnectTick]);

  return {
    items,
    loading,
    error,
    lastSyncAt,
    isLive: status === 'activated' && lastSyncAt != null && !error,
  };
}
