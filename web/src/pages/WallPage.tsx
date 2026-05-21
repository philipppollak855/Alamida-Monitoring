import { useEffect, useMemo, useState } from 'react';
import { useFirestoreCollection } from '../hooks/useFirestoreCollection';
import { firebaseConfigured } from '../firebase';
import type { Sterbefall, Ueberfuehrung } from '../types';

const DEFAULT_KUEHLRAEUME = ['1', '2', '3', '4', '5', '6', '7', '8'];
type WallView = 'kuehlraum' | 'abholungen';

export function WallPage() {
  const [view, setView] = useState<WallView>('kuehlraum');
  const { items: sterbefaelle } = useFirestoreCollection<Sterbefall>(
    'sterbefaelle',
    'updatedAt'
  );
  const { items: ueberfuehrungen } = useFirestoreCollection<Ueberfuehrung>(
    'ueberfuehrungen',
    'updatedAt'
  );

  useEffect(() => {
    const t = setInterval(() => {
      setView((v) => (v === 'kuehlraum' ? 'abholungen' : 'kuehlraum'));
    }, 20000);
    return () => clearInterval(t);
  }, []);

  const kuehlraumMap = useMemo(() => {
    const map = new Map<string, Sterbefall>();
    for (const s of sterbefaelle) {
      const kr = s.kuehlraumId?.trim();
      if (kr) map.set(kr, s);
    }
    return map;
  }, [sterbefaelle]);

  const kuehlraeume = useMemo(() => {
    const fromData = [...kuehlraumMap.keys()];
    const all = new Set([...DEFAULT_KUEHLRAEUME, ...fromData]);
    return [...all].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [kuehlraumMap]);

  const heute = new Date().toISOString().slice(0, 10);
  const abholungenHeute = ueberfuehrungen.filter((u) =>
    u.abholungAm?.includes(heute)
  );

  if (!firebaseConfigured) {
    return (
      <div className="wall-root">
        <h1>Alamida Monitoring</h1>
        <p>Firebase nicht konfiguriert</p>
      </div>
    );
  }

  return (
    <div className="wall-root">
      <h1>
        {view === 'kuehlraum' ? 'Kühlraum-Übersicht' : 'Abholungen heute'}
      </h1>

      {view === 'kuehlraum' && (
        <div className="wall-kuehlraum">
          {kuehlraeume.map((kr) => {
            const fall = kuehlraumMap.get(kr);
            const belegt = Boolean(fall);
            return (
              <div
                key={kr}
                className={`wall-slot ${belegt ? 'belegt' : ''}`}
              >
                <div className="kr">K {kr}</div>
                <div className="name">
                  {belegt
                    ? fall!.verstorbenerName || fall!.sterbefallId
                    : 'frei'}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === 'abholungen' && (
        <div className="wall-abholungen">
          <ul>
            {abholungenHeute.length === 0 && <li>Keine Abholungen heute</li>}
            {abholungenHeute.map((u) => (
              <li key={u.id}>
                <strong>{u.sterbefallId}</strong> — {u.vonOrt} → {u.nachOrt}
                {u.abholungAm && ` (${u.abholungAm})`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
