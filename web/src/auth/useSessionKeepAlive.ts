import { onIdTokenChanged } from 'firebase/auth';
import { useEffect } from 'react';
import { auth } from '../firebase';
import { ensureFreshIdToken } from './sessionRefresh';

const REFRESH_INTERVAL_MS = 45 * 60 * 1000;

/** Hält die Firebase-Sitzung bei langem Tab/PWA-Betrieb aktiv. */
export function useSessionKeepAlive(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !auth) return;

    const refresh = () => {
      void ensureFreshIdToken(true);
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    document.addEventListener('visibilitychange', onVisible);
    const interval = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    const unsubToken = onIdTokenChanged(auth, () => {
      /* Listener hält Auth-Interna aktiv; Refresh bei Sichtbarkeit/Intervall. */
    });

    refresh();

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(interval);
      unsubToken();
    };
  }, [enabled]);
}
