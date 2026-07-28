import { useEffect, useMemo, useRef } from 'react';

type Options = {
  enabled: boolean;
  heartbeatValues: Array<string | number | null | undefined>;
  /** Ab wann ein Stand als eingefroren gilt. */
  staleAfterMs?: number;
  /** Wie oft der Guard prüft. */
  checkEveryMs?: number;
  /** Minimale Zeit zwischen Auto-Reloads (Schleifenschutz). */
  minReloadGapMs?: number;
};

const LAST_RELOAD_KEY = 'wall:autoReloadAtMs';

function canAutoReload(minReloadGapMs: number): boolean {
  try {
    const raw = window.sessionStorage.getItem(LAST_RELOAD_KEY);
    const last = raw ? Number(raw) : 0;
    const now = Date.now();
    if (Number.isFinite(last) && now - last < minReloadGapMs) return false;
    window.sessionStorage.setItem(LAST_RELOAD_KEY, String(now));
    return true;
  } catch {
    return true;
  }
}

export function useWallFreezeGuard({
  enabled,
  heartbeatValues,
  staleAfterMs = 90_000,
  checkEveryMs = 15_000,
  minReloadGapMs = 3 * 60_000,
}: Options) {
  const heartbeatSignature = useMemo(
    () => heartbeatValues.map((v) => String(v ?? '')).join('|'),
    [heartbeatValues]
  );
  const lastProgressAtRef = useRef<number>(Date.now());

  useEffect(() => {
    lastProgressAtRef.current = Date.now();
  }, [heartbeatSignature]);

  useEffect(() => {
    if (!enabled) return;

    const tryRecover = () => {
      const stalledForMs = Date.now() - lastProgressAtRef.current;
      if (stalledForMs < staleAfterMs) return;
      if (!canAutoReload(minReloadGapMs)) return;
      window.location.reload();
    };

    const intervalId = window.setInterval(tryRecover, checkEveryMs);
    const onResume = () => {
      tryRecover();
    };

    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);
    window.addEventListener('pageshow', onResume);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('pageshow', onResume);
    };
  }, [enabled, staleAfterMs, checkEveryMs, minReloadGapMs]);
}

