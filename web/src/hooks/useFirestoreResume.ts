import { useEffect, useRef } from 'react';

const MIN_HIDDEN_MS = 3_000;

/**
 * Nach längerer Hintergrund-Phase Firestore-Listener neu anbinden
 * (Cast/Streaming, minimierter Tab, anderer Browser-Tab).
 */
export function useFirestoreResume(enabled: boolean, onResume: () => void) {
  const hiddenAtRef = useRef<number | null>(null);
  const onResumeRef = useRef(onResume);
  onResumeRef.current = onResume;

  useEffect(() => {
    if (!enabled) return;

    const maybeResume = () => {
      if (document.visibilityState !== 'visible') return;
      const hiddenMs = hiddenAtRef.current != null ? Date.now() - hiddenAtRef.current : 0;
      hiddenAtRef.current = null;
      if (hiddenMs >= MIN_HIDDEN_MS) onResumeRef.current();
    };

    const onHidden = () => {
      if (document.visibilityState === 'hidden') hiddenAtRef.current = Date.now();
    };

    document.addEventListener('visibilitychange', onHidden);
    document.addEventListener('visibilitychange', maybeResume);
    window.addEventListener('focus', maybeResume);
    window.addEventListener('pageshow', maybeResume);

    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      document.removeEventListener('visibilitychange', maybeResume);
      window.removeEventListener('focus', maybeResume);
      window.removeEventListener('pageshow', maybeResume);
    };
  }, [enabled]);
}
