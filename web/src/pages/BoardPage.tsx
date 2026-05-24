import { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LiveDataBar } from '../components/LiveDataBar';
import { TransferCardItem } from '../components/board/TransferCardItem';
import { useNarrowViewport } from '../hooks/useNarrowViewport';
import { useCalendarDay } from '../hooks/useCalendarDay';
import { useFirestoreCollection } from '../hooks/useFirestoreCollection';
import { firebaseConfigured } from '../firebase';
import {
  boardStats,
  buildPrimaerKuehlraumSlots,
  flattenOffene,
} from '../board/boardUtils';
import {
  BOARD_SECTIONS,
  parseBoardSection,
  type BoardSection,
} from '../board/boardSections';
import { filterAktiveSterbefaelle } from '../board/historieLogic';
import { buildUrnenListe, countUrnen } from '../board/urnenLogic';
import { UrnenBereichPanel } from '../components/UrnenBereichPanel';
import { removeSterbefallFromDisposition } from '../services/dispositionFall';
import { clearSterbefallUrnenRetour } from '../services/urnenRetour';
import { DispositionSettingsPanel } from '../components/DispositionSettingsPanel';
import { EndzielChip, SchrittBadge } from '../ui/SchrittBadge';
import { StatCard } from '../ui/StatCard';
import { useDispositionSettings } from '../settings/SettingsProvider';
import { matchEigenerKuehlraum } from '../settings/ortMatchers';
import type { Sterbefall, MonitoringEvent } from '../types';

type TransferFilter = 'alle' | 'heute' | 'abholung';

function sectionBadge(
  section: BoardSection,
  stats: {
    offen: number;
    heute: number;
    abholung: number;
    belegt: number;
    plaetze: number;
    urnen: number;
    faelle: number;
  }
): number | null {
  switch (section) {
    case 'ueberfuehrungen':
      return stats.offen;
    case 'lager':
      return stats.belegt + stats.urnen;
    case 'faelle':
      return stats.faelle;
    default:
      return null;
  }
}

export function BoardPage() {
  const isNarrow = useNarrowViewport();
  const [searchParams, setSearchParams] = useSearchParams();
  const section = parseBoardSection(searchParams.get('tab'));
  const calendarDay = useCalendarDay();
  const { settings } = useDispositionSettings();
  const { items: sterbefaelleRaw, loading, error } =
    useFirestoreCollection<Sterbefall>('sterbefaelle', 'updatedAt');
  const sterbefaelle = useMemo(
    () => filterAktiveSterbefaelle(sterbefaelleRaw),
    [sterbefaelleRaw]
  );
  const { items: events } = useFirestoreCollection<MonitoringEvent>(
    'events',
    'createdAt',
    20
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<TransferFilter>('alle');
  const [urnenPending, setUrnenPending] = useState<string | null>(null);
  const [urnenError, setUrnenError] = useState<string | null>(null);
  const [removePending, setRemovePending] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const offene = useMemo(() => flattenOffene(sterbefaelle), [sterbefaelle, calendarDay]);
  const stats = useMemo(() => boardStats(sterbefaelle, offene), [sterbefaelle, offene, calendarDay]);
  const { cfg: grafenbachCfg, slots: grafenbachSlots } = useMemo(
    () => buildPrimaerKuehlraumSlots(sterbefaelle),
    [sterbefaelle, settings]
  );

  const filteredOffene = useMemo(() => {
    if (filter === 'heute') return offene.filter((o) => o.status === 'heute');
    if (filter === 'abholung')
      return offene.filter((o) => o.istAbholungVomSterbeort || o.status === 'abholung_noetig');
    return offene;
  }, [offene, filter]);

  const heuteOffene = useMemo(
    () => offene.filter((o) => o.status === 'heute'),
    [offene]
  );

  const andereKuehlraeume = useMemo(() => {
    const map = new Map<string, Sterbefall[]>();
    for (const s of sterbefaelle) {
      if (s.status !== 'im_kuehlraum' || !s.kuehlraumId) continue;
      if (matchEigenerKuehlraum(s.kuehlraumId)) continue;
      const kr = s.kuehlraumId.trim();
      if (!map.has(kr)) map.set(kr, []);
      map.get(kr)!.push(s);
    }
    return [...map.entries()];
  }, [sterbefaelle]);

  const belegtGrafenbach = grafenbachSlots.filter(Boolean).length;
  const urnenListe = useMemo(() => buildUrnenListe(sterbefaelle), [sterbefaelle]);
  const urnenCount = useMemo(() => countUrnen(sterbefaelle), [sterbefaelle]);

  const badgeStats = useMemo(
    () => ({
      offen: stats.offen,
      heute: stats.heute,
      abholung: stats.abholung,
      belegt: belegtGrafenbach,
      plaetze: grafenbachCfg.plaetze,
      urnen: urnenCount,
      faelle: sterbefaelle.length,
    }),
    [stats, belegtGrafenbach, grafenbachCfg.plaetze, urnenCount, sterbefaelle.length]
  );

  const goToSection = useCallback(
    (next: BoardSection, nextFilter?: TransferFilter) => {
      if (nextFilter) setFilter(nextFilter);
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === 'uebersicht') p.delete('tab');
          else p.set('tab', next);
          return p;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  async function handleRemoveFromDisposition(s: Sterbefall) {
    const name = s.verstorbenerName || s.sterbefallId || s.id;
    const ok = window.confirm(
      `"${name}" aus Disposition und Wandmonitor entfernen?\n\n` +
        'Der Fall bleibt in Alamida; er erscheint hier nicht mehr (z. B. Testfälle).'
    );
    if (!ok) return;

    setRemoveError(null);
    setRemovePending(s.id);
    try {
      await removeSterbefallFromDisposition(s.id, s.sterbefallId);
      if (expandedId === s.id) setExpandedId(null);
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : 'Entfernen fehlgeschlagen');
    } finally {
      setRemovePending(null);
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
      <div className="alert alert-warn">
        Firebase-Web-Config fehlt — <code>web/.env</code> prüfen.
      </div>
    );
  }

  return (
    <div className={`board board-workspace ${isNarrow ? 'board--narrow' : ''}`}>
      <header className="board-hero board-workspace-hero">
        <div className="board-hero-text">
          <h1>Disposition</h1>
          {!isNarrow && (
            <p>Überführungen, Kühlraum und Verlauf — strukturiert nach Bereichen</p>
          )}
        </div>
        <div className="board-hero-actions">
          <LiveDataBar compact={isNarrow} />
          <Link to="/wall" className="board-wall-link board-wall-link--visible">
            Wand
          </Link>
        </div>
      </header>

      <nav className="board-section-nav" aria-label="Disposition-Bereiche">
        {BOARD_SECTIONS.map((item) => {
          const badge = sectionBadge(item.id, badgeStats);
          return (
            <button
              key={item.id}
              type="button"
              className={`board-section-tab ${section === item.id ? 'active' : ''}`}
              aria-current={section === item.id ? 'page' : undefined}
              onClick={() => goToSection(item.id)}
            >
              <span className="board-section-tab-label">
                {isNarrow ? item.short : item.label}
              </span>
              {badge != null && badge > 0 && (
                <span className="board-section-badge">{badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      <main className="board-section-body">
        {error && <div className="alert alert-danger">{error}</div>}
        {urnenError && <div className="alert alert-danger">{urnenError}</div>}
        {section === 'uebersicht' && (
          <div className="board-overview">
            <div className="board-overview-kpis kpi-grid">
              <StatCard
                label="Offen"
                value={stats.offen}
                hint="geplante Schritte"
                accent="accent"
                onClick={() => goToSection('ueberfuehrungen', 'alle')}
              />
              <StatCard
                label="Heute"
                value={stats.heute}
                hint="Termin heute"
                accent="warn"
                onClick={() => goToSection('ueberfuehrungen', 'heute')}
              />
              <StatCard
                label="Abholung"
                value={stats.abholung}
                hint="inkl. Sterbeort"
                accent="warn"
                onClick={() => goToSection('ueberfuehrungen', 'abholung')}
              />
              <StatCard
                label="Kühlraum"
                value={`${belegtGrafenbach}/${grafenbachCfg.plaetze}`}
                hint={grafenbachCfg.label}
                accent="success"
                onClick={() => goToSection('lager')}
              />
              <StatCard
                label="Urnen"
                value={urnenCount}
                hint="Retour aus Kremation"
                accent="accent"
                onClick={() => goToSection('lager')}
              />
            </div>

            <div className="board-overview-grid">
              <section className="panel board-overview-card">
                <div className="board-overview-card-head">
                  <div>
                    <h2>Heute</h2>
                    <p>{stats.heute} Termin{stats.heute === 1 ? '' : 'e'}</p>
                  </div>
                  <button
                    type="button"
                    className="board-overview-link"
                    onClick={() => goToSection('ueberfuehrungen', 'heute')}
                  >
                    Alle →
                  </button>
                </div>
                {heuteOffene.length === 0 ? (
                  <p className="board-overview-empty">Keine Termine heute.</p>
                ) : (
                  <div className="board-overview-preview">
                    {heuteOffene.slice(0, 3).map((r, i) => (
                      <TransferCardItem key={`heute-${r.sterbefallId}-${i}`} row={r} />
                    ))}
                  </div>
                )}
              </section>

              <section className="panel board-overview-card">
                <div className="board-overview-card-head">
                  <div>
                    <h2>{grafenbachCfg.label}</h2>
                    <p>
                      {belegtGrafenbach} von {grafenbachCfg.plaetze} belegt
                    </p>
                  </div>
                  <button
                    type="button"
                    className="board-overview-link"
                    onClick={() => goToSection('lager')}
                  >
                    Lager →
                  </button>
                </div>
                <div
                  className="cool-grid board-overview-cool"
                  style={{
                    gridTemplateColumns: `repeat(${Math.min(grafenbachCfg.plaetze, 6)}, 1fr)`,
                  }}
                >
                  {grafenbachSlots.map((fall, i) => (
                    <div
                      key={i}
                      className={`cool-cell ${fall ? 'occupied' : 'free'}`}
                    >
                      <span className="cool-cell-nr">{i + 1}</span>
                      {fall ? (
                        <span className="cool-cell-name">
                          {fall.verstorbenerName || fall.sterbefallId}
                        </span>
                      ) : (
                        <span className="cool-cell-free">Frei</span>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section className="panel board-overview-card">
                <div className="board-overview-card-head">
                  <h2>Aktivität</h2>
                </div>
                <ul className="feed-list board-overview-feed">
                  {events.slice(0, 5).map((ev) => (
                    <li key={ev.id}>
                      <span className="feed-type">{ev.type}</span>
                      <span className="feed-detail">
                        {ev.sterbefallId}
                        {ev.aktuellePosition && ` · ${ev.aktuellePosition}`}
                      </span>
                    </li>
                  ))}
                  {events.length === 0 && (
                    <li className="feed-empty">Noch keine Events</li>
                  )}
                </ul>
              </section>

              <section className="panel board-overview-card board-overview-card--meta">
                <h2>Schnellzugriff</h2>
                <p className="board-overview-meta-text">
                  {sterbefaelle.length} aktive Fälle · {stats.offen} offene Schritte
                </p>
                <div className="board-overview-actions">
                  <button
                    type="button"
                    className="btn-ghost btn-small"
                    onClick={() => goToSection('faelle')}
                  >
                    Alle Fälle
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-small"
                    onClick={() => goToSection('einstellungen')}
                  >
                    Erkennung & Kühlraum
                  </button>
                  <Link to="/wall" className="btn-ghost btn-small">
                    Wandmonitor
                  </Link>
                </div>
              </section>
            </div>
          </div>
        )}

        {section === 'ueberfuehrungen' && (
          <section className="panel panel-primary">
            <div className="panel-head">
              <div>
                <h2>Offene Überführungen</h2>
                {!isNarrow && (
                  <p>Abholung · Überführung · Kremation nach Überführungsorten</p>
                )}
              </div>
              <div className="filter-tabs" role="tablist">
                {(['alle', 'heute', 'abholung'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="tab"
                    aria-selected={filter === f}
                    className={filter === f ? 'filter-tab active' : 'filter-tab'}
                    onClick={() => setFilter(f)}
                  >
                    {f === 'alle' ? 'Alle' : f === 'heute' ? 'Heute' : 'Abholung'}
                  </button>
                ))}
              </div>
            </div>

            {loading && sterbefaelle.length === 0 ? (
              <div className="empty-state">Lade Fälle…</div>
            ) : filteredOffene.length === 0 ? (
              <div className="empty-state">Keine offenen Schritte in dieser Ansicht.</div>
            ) : (
              <div className="transfer-list">
                {filteredOffene.map((r, i) => (
                  <TransferCardItem key={`${r.sterbefallId}-${r.terminAm}-${i}`} row={r} />
                ))}
              </div>
            )}
          </section>
        )}

        {section === 'lager' && (
          <div className="board-lager-grid">
            <section className="panel">
              <div className="panel-head compact">
                <div>
                  <h2>{grafenbachCfg.label}</h2>
                  <p>
                    {belegtGrafenbach} von {grafenbachCfg.plaetze} belegt
                  </p>
                </div>
              </div>
              <div
                className="cool-grid"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(grafenbachCfg.plaetze, 6)}, 1fr)`,
                }}
              >
                {grafenbachSlots.map((fall, i) => (
                  <div
                    key={i}
                    className={`cool-cell ${fall ? 'occupied' : 'free'}`}
                  >
                    <span className="cool-cell-nr">{i + 1}</span>
                    {fall ? (
                      <>
                        <span className="cool-cell-name">
                          {fall.verstorbenerName || fall.sterbefallId}
                        </span>
                        <span className="cool-cell-meta">{fall.aktuellePosition}</span>
                        {(fall.naechsterSchrittNach ?? fall.naechsteUeberfuehrungNach) && (
                          <span className="cool-cell-next">
                            → {fall.naechsterSchrittNach ?? fall.naechsteUeberfuehrungNach}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="cool-cell-free">Frei</span>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <UrnenBereichPanel
              liste={urnenListe}
              pendingDocId={urnenPending}
              onUndo={(id) => void handleUrnenUndo(id)}
              variant="board"
            />

            {andereKuehlraeume.length > 0 && (
              <section className="panel">
                <div className="panel-head compact">
                  <h2>Weitere Kühlräume</h2>
                </div>
                <div className="mini-kr-list">
                  {andereKuehlraeume.map(([kr, faelle]) => (
                    <div key={kr} className="mini-kr">
                      <span className="mini-kr-title">{kr}</span>
                      {faelle.map((s) => (
                        <div key={s.id} className="mini-kr-row">
                          <strong>{s.verstorbenerName || s.sterbefallId}</strong>
                          <span>{s.aktuellePosition}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {urnenListe.length === 0 && andereKuehlraeume.length === 0 && belegtGrafenbach === 0 && (
              <p className="empty-state">Keine Belegung in Lagerbereichen.</p>
            )}
          </div>
        )}

        {section === 'faelle' && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Alle Fälle</h2>
                {!isNarrow && (
                  <p>Verlauf und Endziel — Erde: Beisetzung · Urne: Krematorium</p>
                )}
              </div>
              <span className="panel-badge">{sterbefaelle.length} Fälle</span>
            </div>
            {removeError && (
              <p className="board-remove-error" role="alert">
                {removeError}
              </p>
            )}
            <div className="case-list">
              {sterbefaelle.map((s) => {
                const open = expandedId === s.id;
                return (
                  <div key={s.id} className={`case-card ${open ? 'open' : ''}`}>
                    <div className="case-card-header">
                      <button
                        type="button"
                        className="case-card-trigger"
                        onClick={() => setExpandedId(open ? null : s.id)}
                        aria-expanded={open}
                      >
                        <div className="case-card-main">
                          <span className="case-name">{s.verstorbenerName || s.sterbefallId}</span>
                          <span className="case-id">{s.sterbefallId}</span>
                        </div>
                        <div className="case-card-meta">
                          {s.istNeuerFall && <span className="chip chip-abholung">Neu</span>}
                          <span className="case-position">{s.aktuellePosition ?? '—'}</span>
                          {s.endziel && (
                            <EndzielChip typ={s.endzielTyp} ort={s.endziel} />
                          )}
                        </div>
                        <span className="case-chevron" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="case-remove-btn"
                        title="Aus Disposition entfernen (Testfall)"
                        disabled={removePending === s.id}
                        onClick={() => void handleRemoveFromDisposition(s)}
                      >
                        {removePending === s.id ? '…' : 'Entfernen'}
                      </button>
                    </div>
                    {open && (
                      <div className="case-timeline">
                        {(s.verlauf ?? []).map((v) => (
                          <div key={v.nummer} className={`timeline-step typ-${v.typ}`}>
                            <div className="timeline-dot" />
                            <div className="timeline-body">
                              <div className="timeline-head">
                                <SchrittBadge typ={v.typ} />
                                {(v.terminAm ?? v.abholungAm) && (
                                  <time>{v.terminAm ?? v.abholungAm}</time>
                                )}
                              </div>
                              <p>
                                {v.vonOrt && v.nachOrt
                                  ? `${v.vonOrt} → ${v.nachOrt}`
                                  : v.ort}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {section === 'einstellungen' && (
          <section className="board-settings-section">
            <DispositionSettingsPanel defaultOpen />
          </section>
        )}
      </main>
    </div>
  );
}


