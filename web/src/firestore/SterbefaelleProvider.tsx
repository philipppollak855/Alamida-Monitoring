import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Query,
  type DocumentData,
} from 'firebase/firestore';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '../auth/AuthContext';
import { isFirestoreAuthError, normalizeFirestoreError } from '../auth/firestoreErrors';
import { ensureFreshIdToken } from '../auth/sessionRefresh';
import { db } from '../firebase';
import type { Sterbefall } from '../types';

const COLLECTION = 'sterbefaelle';
const ORDER_FIELD = 'lastSeenAt';
const MAX_DOCS = 200;

type SterbefaelleContextValue = {
  items: Sterbefall[];
  loading: boolean;
  error: string | null;
  lastSyncAt: Date | null;
  isLive: boolean;
};

const SterbefaelleContext = createContext<SterbefaelleContextValue | null>(null);

/** Ein gemeinsamer onSnapshot für alle Seiten — vermeidet parallele Listener. */
export function SterbefaelleProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [items, setItems] = useState<Sterbefall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [authReconnectTick, setAuthReconnectTick] = useState(0);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && status === 'activated') {
        void ensureFreshIdToken(true);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [status]);

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
    const ref = collection(db, COLLECTION);
    const q: Query<DocumentData> = query(
      ref,
      orderBy(ORDER_FIELD, 'desc'),
      limit(MAX_DOCS)
    );

    const unsub = onSnapshot(
      q,
      { includeMetadataChanges: false },
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Sterbefall));
        setLastSyncAt(new Date());
        setLoading(false);
        setError(null);
      },
      (err) => {
        if (isFirestoreAuthError(err)) {
          setError(normalizeFirestoreError(err));
          void ensureFreshIdToken(true).then((ok) => {
            if (ok) setAuthReconnectTick((t) => t + 1);
          });
        } else {
          setError(normalizeFirestoreError(err));
        }
        setLoading(false);
      }
    );

    return () => unsub();
  }, [status, authReconnectTick]);

  const value = useMemo(
    (): SterbefaelleContextValue => ({
      items,
      loading,
      error,
      lastSyncAt,
      isLive: status === 'activated' && lastSyncAt != null && !error,
    }),
    [items, loading, error, lastSyncAt, status]
  );

  return (
    <SterbefaelleContext.Provider value={value}>{children}</SterbefaelleContext.Provider>
  );
}

export function useSterbefaelle(): SterbefaelleContextValue {
  const ctx = useContext(SterbefaelleContext);
  if (!ctx) {
    throw new Error('useSterbefaelle muss innerhalb von SterbefaelleProvider verwendet werden');
  }
  return ctx;
}
