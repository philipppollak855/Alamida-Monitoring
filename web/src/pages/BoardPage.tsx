import { useMemo } from 'react';
import { useFirestoreCollection } from '../hooks/useFirestoreCollection';
import { firebaseConfigured } from '../firebase';
import type { Sterbefall, Ueberfuehrung, MonitoringEvent } from '../types';

const DEFAULT_KUEHLRAEUME = ['1', '2', '3', '4', '5', '6', '7', '8'];

export function BoardPage() {
  const { items: sterbefaelle, loading: l1, error: e1 } =
    useFirestoreCollection<Sterbefall>('sterbefaelle', 'updatedAt');
  const { items: ueberfuehrungen, loading: l2, error: e2 } =
    useFirestoreCollection<Ueberfuehrung>('ueberfuehrungen', 'updatedAt');
  const { items: events } = useFirestoreCollection<MonitoringEvent>(
    'events',
    'createdAt',
    20
  );

  const loading = l1 || l2;
  const error = e1 || e2;

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

  const unterwegs = sterbefaelle.filter((s) => s.status === 'unterwegs' || !s.kuehlraumId);

  const heute = new Date().toISOString().slice(0, 10);
  const abholungenHeute = ueberfuehrungen.filter((u) =>
    u.abholungAm?.includes(heute)
  );

  if (!firebaseConfigured) {
    return (
      <div className="banner">
        Firebase-Web-Config fehlt. Kopieren Sie <code>web/.env.example</code> nach{' '}
        <code>web/.env</code> und tragen Sie die Werte aus der Firebase Console ein.
      </div>
    );
  }

  return (
    <>
      {error && <div className="banner">{error}</div>}
      {loading && <p style={{ color: 'var(--muted)' }}>Lade Daten…</p>}

      <div className="grid-3">
        <section className="card" style={{ gridColumn: '1 / -1' }}>
          <h2>Kühlraum-Belegung (aus Alamida)</h2>
          <div className="kuehlraum-grid">
            {kuehlraeume.map((kr) => {
              const fall = kuehlraumMap.get(kr);
              const belegt = Boolean(fall);
              return (
                <div
                  key={kr}
                  className={`kuehlraum-slot ${belegt ? 'belegt' : 'frei'}`}
                >
                  <div className="label">Kühlraum {kr}</div>
                  <div className="name">
                    {belegt
                      ? fall!.verstorbenerName || fall!.sterbefallId || '—'
                      : 'frei'}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card">
          <h2>Unterwegs / ohne Kühlraum</h2>
          {unterwegs.length === 0 && (
            <p style={{ color: 'var(--muted)' }}>Keine Einträge</p>
          )}
          {unterwegs.map((s) => (
            <div key={s.id} className="list-item">
              <strong>{s.verstorbenerName || s.sterbefallId || s.id}</strong>
              <span className="badge">{s.status}</span>
            </div>
          ))}
        </section>

        <section className="card">
          <h2>Abholungen heute</h2>
          {abholungenHeute.length === 0 && (
            <p style={{ color: 'var(--muted)' }}>Keine für heute</p>
          )}
          {abholungenHeute.map((u) => (
            <div key={u.id} className="list-item">
              <strong>{u.sterbefallId}</strong>
              <div className="route">
                {u.vonOrt} → {u.nachOrt}
                {u.abholungAm && ` · ${u.abholungAm}`}
              </div>
            </div>
          ))}
        </section>

        <section className="card">
          <h2>Alle Überführungen</h2>
          {ueberfuehrungen.slice(0, 15).map((u) => (
            <div key={u.id} className="list-item">
              <strong>{u.sterbefallId}</strong>
              {u.kuehlraumId && (
                <span className="badge">KR {u.kuehlraumId}</span>
              )}
              <div className="route">
                {u.vonOrt} → {u.nachOrt}
              </div>
            </div>
          ))}
        </section>

        <section className="card">
          <h2>Live-Feed</h2>
          {events.length === 0 && (
            <p style={{ color: 'var(--muted)' }}>Noch keine Events</p>
          )}
          {events.map((ev) => (
            <div key={ev.id} className="list-item">
              <strong>{ev.type}</strong> — {ev.sterbefallId}
              {ev.kuehlraumId && ` · Kühlraum ${ev.kuehlraumId}`}
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
