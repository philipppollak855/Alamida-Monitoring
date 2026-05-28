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
  rotationPaused: boolean,
  /** z. B. Mobil: kein automatischer Tabwechsel */
  autoRotateEnabled = true,
  views: WallView[] = WALL_VIEWS
) {
  const activeViews = views.length > 0 ? views : [WALL_VIEWS[0]];
  const [slide, setSlide] = useState(0);
  const [view, setView] = useState<WallView>(activeViews[0]);
  const [secondsLeft, setSecondsLeft] = useState(durations[activeViews[0]]);
  const rotationOff = rotationPaused || !autoRotateEnabled;

  const goToSlide = useCallback(
    (index: number) => {
      const i = ((index % activeViews.length) + activeViews.length) % activeViews.length;
      setSlide(i);
      setView(activeViews[i]);
      setSecondsLeft(durations[activeViews[i]]);
    },
    [durations, activeViews]
  );

  useEffect(() => {
    if (slide >= activeViews.length) {
      setSlide(0);
      setView(activeViews[0]);
      setSecondsLeft(durations[activeViews[0]]);
      return;
    }
    setView(activeViews[slide]);
    setSecondsLeft(durations[activeViews[slide]]);
  }, [activeViews, slide, durations]);

  useEffect(() => {
    if (rotationOff) return;
    const current = activeViews[slide];
    setSecondsLeft(durations[current]);

    const id = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev > 1) return prev - 1;
        setSlide((s) => {
          const next = (s + 1) % activeViews.length;
          setView(activeViews[next]);
          return next;
        });
        return 0;
      });
    }, 1000);

    return () => window.clearInterval(id);
  }, [slide, rotationOff, durations, activeViews]);

  return { slide, view, secondsLeft, goToSlide, setView, setSlide, rotationOff };
}
