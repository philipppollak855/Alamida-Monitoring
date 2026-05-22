import { useCallback, useEffect, useState } from 'react';
import type { WallTabWechselSekunden } from '../types/dispositionSettings';

export type WallView = 'kuehlraum' | 'extern' | 'kalender' | 'abholungen' | 'offen';

export const WALL_VIEWS: WallView[] = ['kuehlraum', 'extern', 'kalender', 'abholungen', 'offen'];

const DEFAULT_SEC = 18;
const MIN_SEC = 5;
const MAX_SEC = 300;

function clampSec(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return DEFAULT_SEC;
  return Math.max(MIN_SEC, Math.min(MAX_SEC, v));
}

export function wallDurationsFromSettings(
  raw?: WallTabWechselSekunden
): Record<WallView, number> {
  return {
    kuehlraum: clampSec(raw?.kuehlraum ?? DEFAULT_SEC),
    extern: clampSec(raw?.extern ?? DEFAULT_SEC),
    kalender: clampSec(raw?.kalender ?? DEFAULT_SEC),
    abholungen: clampSec(raw?.abholungen ?? DEFAULT_SEC),
    offen: clampSec(raw?.offen ?? DEFAULT_SEC),
  };
}

export function useWallTabRotation(
  durations: Record<WallView, number>,
  rotationPaused: boolean
) {
  const [slide, setSlide] = useState(0);
  const [view, setView] = useState<WallView>(WALL_VIEWS[0]);
  const [secondsLeft, setSecondsLeft] = useState(durations[WALL_VIEWS[0]]);

  const goToSlide = useCallback(
    (index: number) => {
      const i = ((index % WALL_VIEWS.length) + WALL_VIEWS.length) % WALL_VIEWS.length;
      setSlide(i);
      setView(WALL_VIEWS[i]);
      setSecondsLeft(durations[WALL_VIEWS[i]]);
    },
    [durations]
  );

  useEffect(() => {
    if (rotationPaused) return;
    const current = WALL_VIEWS[slide];
    setSecondsLeft(durations[current]);

    const id = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev > 1) return prev - 1;
        setSlide((s) => {
          const next = (s + 1) % WALL_VIEWS.length;
          setView(WALL_VIEWS[next]);
          return next;
        });
        return 0;
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [slide, rotationPaused, durations]);

  return { slide, view, secondsLeft, goToSlide, setView, setSlide };
}
