import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { LiveIndicator } from '../components/LiveIndicator';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { useCalendarDay } from '../hooks/useCalendarDay';
import { useFirestoreCollection } from '../hooks/useFirestoreCollection';
import { firebaseConfigured } from '../firebase';
import { buildPrimaerKuehlraumSlots, flattenOffene } from '../board/boardUtils';
import { useDispositionSettings } from '../settings/SettingsProvider';
import { filterAktiveSterbefaelle } from '../board/historieLogic';
import { buildExternGruppen, externGesamt } from '../board/wallExternUtils';
import { UrnenBereichPanel } from '../components/UrnenBereichPanel';
import { buildUrnenListe } from '../board/urnenLogic';
import {
  clearSterbefallUrnenRetour,
  markSterbefallUrnenRetour,
} from '../services/urnenRetour';
import {
  useWallTabRotation,
  wallDurationsFromSettings,
  WALL_VIEWS,
  type WallView,
} from '../hooks/useWallTabRotation';
import { SchrittBadge } from '../ui/SchrittBadge';
import { RouteFlow } from '../ui/RouteFlow';
import type { Sterbefall } from '../types';

const WALL_TAB_LABELS: Record<WallView, string> = {
  kuehlraum: 'Kühlraum',
  extern: 'Extern',
  abholungen: 'Heute',
  offen: 'Offen',
};

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function WallPage() {
  const { settings } = useDispositionSettings();
  const { signOut } = useAuth();
  const now = useClock();
  const [rotationPaused, setRotationPaused] = useState(false);
  const [urnenPending, setUrnenPending] = useState<string | null>(null);
  const [urnenError, setUrnenError] = useState<string | null>(null);
  const tabDurations = useMemo(
    () => wallDurationsFromSettings(settings.wallTabWechselSekunden),
    [settings.wallTabWechselSekunden]
  );
  const { slide, view, secondsLeft, goToSlide } = useWallTabRotation(
    tabDurations,
    rotationPaused
  );

  const sterbefaelleQuery = useFirestoreCollection<Sterbefall>('sterbefaelle', 'updatedAt');
  const { items: sterbefaelleRaw, lastSyncAt, isLive, loading } = sterbefaelleQuery;
  const calendarDay = useCalendarDay();
  const sterbefaelle = useMemo(
    () => filterAktiveSterbefaelle(sterbefaelleRaw),
    [sterbefaelleRaw]
  );

  const { cfg, slots } = useMemo(
    () => buildPrimaerKuehlraumSlots(sterbefaelle),
    [sterbefaelle, settings]
  );
  const externGruppen = useMemo(
    () => buildExternGruppen(sterbefaelle),
    [sterbefaelle, settings]
  );
  const externTotal = useMemo(() => externGesamt(externGruppen), [externGruppen]);
  const offene = useMemo(() => flattenOffene(sterbefaelle), [sterbefaelle, calendarDay]);
  const heuteOffen = useMemo(() => offene.filter((o) => o.status === 'heute'), [offene, calendarDay]);
  const belegt = slots.filter(Boolean).length;
  const kuehlraumRows = Math.max(1, Math.ceil(cfg.plaetze / 3));
  const urnenListe = useMemo(() => buildUrnenListe(sterbefaelle), [sterbefaelle]);

  async function handleRetour(docId: string, retourVon?: string) {
    setUrnenError(null);
    setUrnenPending(docId);
    try {
      await markSterbefallUrnenRetour(docId, retourVon);
    } catch (e) {
      setUrnenError(e instanceof Error ? e.message : 'Retour fehlgeschlagen');
    } finally {
      setUrnenPending(null);
    }
  }

  async function handleUrnenUndo(docId: string) {
    setUrnenError(null);
    setUrnenPending(docId);
    try {
      await clearSterbefallUrnenRetour(docId);
    } catch (e) {
      setUrnenError(e instanceof Error ? e.message : 'Rückgängig fehlgeschlagen');
    } finally {
      setUrnenPending(null);
    }
  }

  if (!firebaseConfigured) {
    return (
      <div className="wall">
        <p className="wall-error">Firebase nicht konfiguriert</p>
      </div>
    );
  }

  const timeStr = now.toLocaleTimeString('de-AT', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const dateStr = now.toLocaleDateString('de-AT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="wall">
      <div className="wall-bg" aria-hidden />
      <header className="wall-topbar">
        <div className="wall-brand">
          <span className="brand-mark" />
          <div>
            <span className="wall-brand-title">Alamida Monitoring</span>
            <span className="wall-brand-sub">Wandmonitor · Live</span>
          </div>
        </div>
        <div className="wall-clock">
          <span className="wall-time">{timeStr}</span>
          <span className="wall-date">{dateStr}</span>
        </div>
        <div className="wall-topbar-end">
          <ThemeSwitch />
          <LiveIndicator
            isLive={isLive}
            lastSyncAt={lastSyncAt}
            loading={loading}
            label="Live"
            hideSyncAge
          />
          {!rotationPaused && (
            <span className="wall-tab-countdown" title="Zeit bis zum nächsten Tab">
              Tabwechsel in {secondsLeft}s
            </span>
          )}
          <Link to="/" className="wall-link">
            Disposition
          </Link>
          <button type="button" className="btn-ghost btn-small" onClick={() => signOut()}>
            Abmelden
          </button>
        </div>
      </header>

      <div className="wall-view-tabs">
        {WALL_VIEWS.map((v, i) => (
          <button
            key={v}
            type="button"
            className={`wall-view-tab ${view === v ? 'active' : ''} ${!rotationPaused && slide === i ? 'auto' : ''}`}
            onClick={() => goToSlide(i)}
          >
            {v === 'kuehlraum'
              ? `Kühlraum (${belegt}/${cfg.plaetze}${urnenListe.length > 0 ? ` · ${urnenListe.length} Urnen` : ''})`
              : v === 'extern'
                ? `Extern (${externTotal})`
                : v === 'abholungen'
                  ? `Heute (${heuteOffen.length})`
                  : `Offen (${offene.length})`}
          </button>
        ))}
      </div>

      <div className="wall-stage">
        {view === 'kuehlraum' && (
          <div className="wall-kuehlraum-stage">
            <h2 className="wall-stage-title">{cfg.label}</h2>
            <div
              className="wall-cool-grid"
              style={
                {
                  '--kr-cols': 3,
                  '--kr-rows': kuehlraumRows,
                } as React.CSSProperties
              }
            >
              {slots.map((fall, i) => (
                <div
                  key={i}
                  className={`wall-cool-tile ${fall ? 'on' : 'off'}`}
                >
                  <span className="wall-tile-nr">Platz {i + 1}</span>
                  {fall ? (
                    <>
                      <span className="wall-tile-name">
                        {fall.verstorbenerName || fall.sterbefallId}
                      </span>
                      <span className="wall-tile-pos">{fall.aktuellePosition}</span>
                    </>
                  ) : (
                    <span className="wall-tile-free">Frei</span>
                  )}
                </div>
              ))}
            </div>

            <UrnenBereichPanel
              liste={urnenListe}
              pendingDocId={urnenPending}
              onUndo={(id) => void handleUrnenUndo(id)}
              variant="wall"
            />
          </div>
        )}

        {view === 'extern' && (
          <div className="wall-extern-stage">
            <h2 className="wall-stage-title">Extern — Krankenhäuser & Kremation</h2>
            <p className="wall-stage-sub">
              Verstorbene außerhalb des Firmenkühlraums, noch am Sterbeort oder im
              Krematorium
            </p>
            {urnenError && (
              <p className="wall-retour-error" role="alert">
                {urnenError}
              </p>
            )}
            {externGruppen.length === 0 ? (
              <p className="wall-empty">Keine externen Verstorbenen</p>
            ) : (
              <div className="wall-extern-grid">
                {externGruppen.map((g) => (
                  <article
                    key={g.key}
                    className={`wall-extern-card wall-extern-card--${g.typ}`}
                  >
                    <header className="wall-extern-card-head">
                      <span className={`wall-extern-badge wall-extern-badge--${g.typ}`}>
                        {g.typ === 'krankenhaus' ? 'Krankenhaus' : 'Kremation'}
                      </span>
                      <h3 className="wall-extern-ort">{g.ort}</h3>
                      <span className="wall-extern-count">{g.faelle.length}</span>
                    </header>
                    <ul className="wall-extern-list">
                      {g.faelle.map((f) => (
                        <li key={f.docId} className="wall-extern-person">
                          <div className="wall-extern-person-main">
                            <span className="wall-extern-name">{f.name}</span>
                            <span className="wall-extern-meta">
                              {f.hinweis}
                              {f.terminAm ? ` · ${f.terminAm}` : ''}
                            </span>
                          </div>
                          {g.typ === 'kremation' && (
                            <button
                              type="button"
                              className="wall-retour-btn"
                              disabled={urnenPending === f.docId}
                              title="In Bereich Urnen unter Kühlraum übernehmen"
                              onClick={() => void handleRetour(f.docId, f.kremationOrt)}
                            >
                              {urnenPending === f.docId ? '…' : 'Retour'}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {view === 'abholungen' && (
          <div className="wall-list-stage">
            <h2 className="wall-stage-title">Abholungen & Termine heute</h2>
            {heuteOffen.length === 0 ? (
              <p className="wall-empty">Keine Termine für heute</p>
            ) : (
              <div className="wall-big-list">
                {heuteOffen.map((r, i) => (
                  <article key={i} className="wall-big-row">
                    <time>{r.terminAm}</time>
                    <div className="wall-big-main">
                      <span className="wall-big-name">{r.name}</span>
                      <RouteFlow von={r.vonOrt} nach={r.nachOrt} />
                    </div>
                    <SchrittBadge typ={r.schrittTyp} />
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {view === 'offen' && (
          <div className="wall-list-stage">
            <h2 className="wall-stage-title">Alle offenen Überführungen</h2>
            {offene.length === 0 ? (
              <p className="wall-empty">Keine offenen Schritte</p>
            ) : (
              <div className="wall-big-list scroll">
                {offene.slice(0, 12).map((r, i) => (
                  <article key={i} className="wall-big-row">
                    <time>{r.terminAm}</time>
                    <div className="wall-big-main">
                      <span className="wall-big-name">{r.name}</span>
                      <RouteFlow von={r.vonOrt} nach={r.nachOrt} />
                    </div>
                    <SchrittBadge typ={r.schrittTyp} />
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="wall-footer">
        <div className="wall-progress">
          {WALL_VIEWS.map((_, i) => (
            <span key={i} className={`wall-progress-dot ${slide === i ? 'on' : ''}`} />
          ))}
        </div>
        <div className="wall-footer-actions">
          <button
            type="button"
            className={`wall-pause-btn ${rotationPaused ? 'is-paused' : ''}`}
            aria-pressed={rotationPaused}
            onClick={() => setRotationPaused((p) => !p)}
          >
            {rotationPaused ? 'Fortsetzen' : 'Pause'}
          </button>
          <span className="wall-rotate-hint">
            {rotationPaused
              ? 'Automatischer Wechsel pausiert · Tabs manuell wählbar'
              : `${WALL_TAB_LABELS[view]}: ${tabDurations[view]}s · als Nächstes ${WALL_TAB_LABELS[WALL_VIEWS[(slide + 1) % WALL_VIEWS.length]]}`}
          </span>
        </div>
      </footer>
    </div>
  );
}
