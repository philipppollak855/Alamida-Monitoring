import { useEffect, useState } from 'react';

/** Uhr für Wand/PWA — bei Tab-Rückkehr sofort aktualisieren (Timer im Hintergrund gedrosselt). */
export function useWallClock(tickMs = 1000) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const sync = () => setNow(new Date());
    sync();

    const id = window.setInterval(sync, tickMs);
    const onResume = () => {
      if (document.visibilityState === 'visible') sync();
    };

    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('focus', onResume);
    window.addEventListener('pageshow', onResume);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('pageshow', onResume);
    };
  }, [tickMs]);

  return now;
}
