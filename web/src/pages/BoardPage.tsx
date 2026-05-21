import { useMemo, useState } from 'react';
import { LiveDataBar } from '../components/LiveDataBar';
import { useFirestoreCollection } from '../hooks/useFirestoreCollection';
import { firebaseConfigured } from '../firebase';
import {
  boardStats,
  buildPrimaerKuehlraumSlots,
  flattenOffene,
} from '../board/boardUtils';
import { filterAktiveSterbefaelle } from '../board/historieLogic';
import { DispositionSettingsPanel } from '../components/DispositionSettingsPanel';
import { EndzielChip, SchrittBadge, StatusChip } from '../ui/SchrittBadge';
import { RouteFlow } from '../ui/RouteFlow';
import { StatCard } from '../ui/StatCard';
import { useDispositionSettings } from '../settings/SettingsProvider';
import { matchEigenerKuehlraum } from '../settings/ortMatchers';
import type { Sterbefall, MonitoringEvent } from '../types';

export function BoardPage() {
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
  const [filter, setFilter] = useState<'alle' | 'heute' | 'abholung'>('alle');

  const offene = useMemo(() => flattenOffene(sterbefaelle), [sterbefaelle]);
  const stats = useMemo(() => boardStats(sterbefaelle, offene), [sterbefaelle, offene]);
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

  if (!firebaseConfigured) {
    return (
      <div className="alert alert-warn">
        Firebase-Web-Config fehlt — <code>web/.env</code> prüfen.
      </div>
    );
  }

  return (
    <div className="board">
      <header className="board-hero">
        <div className="board-hero-text">
          <h1>Disposition</h1>
          <p>Überführungen, Kühlraum und Verlauf — Echtzeit aus Alamida</p>
        </div>
        <LiveDataBar />
      </header>

      {error && <div className="alert alert-danger">{error}</div>}

      <DispositionSettingsPanel />

      <div className="kpi-grid">
        <StatCard label="Offen" value={stats.offen} hint="geplante Schritte" accent="accent" />
        <StatCard label="Heute" value={stats.heute} hint="Termin heute" accent="warn" />
        <StatCard
          label="Abholung"
          value={stats.abholung}
          hint="inkl. Sterbeort"
          accent="warn"
        />
        <StatCard
          label="Kühlraum"
          value={`${belegtGrafenbach}/${grafenbachCfg.plaetze}`}
          hint={grafenbachCfg.label}
          accent="success"
        />
      </div>

      <div className="board-grid">
        <section className="panel panel-primary">
          <div className="panel-head">
            <div>
              <h2>Offene Überführungen</h2>
              <p>Abholung · Überführung · Kremation nach Überführungsorten</p>
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
                <article
                  key={`${r.sterbefallId}-${r.terminAm}-${i}`}
                  className={`transfer-card transfer-${r.schrittTyp} status-${r.status}`}
                >
                  <div className="transfer-card-top">
                    <time className="transfer-date">{r.terminAm}</time>
                    <SchrittBadge typ={r.schrittTyp} />
                    <StatusChip
                      status={r.istAbholungVomSterbeort ? 'abholung_noetig' : r.status}
                      highlight={r.status === 'heute'}
                    />
                  </div>
                  <div className="transfer-person">
                    <span className="transfer-name">{r.name}</span>
                    <span className="transfer-id">{r.sterbefallId}</span>
                  </div>
                  <RouteFlow von={r.vonOrt} nach={r.nachOrt} />
                  <div className="transfer-card-foot">
                    <EndzielChip typ={r.endzielTyp} ort={r.endziel} />
                    {(r.schrittTyp === 'abholung' || r.istAbholungVomSterbeort) &&
                      r.abholortIstKrankenhaus && (
                        <span className="chip chip-muted">Krankenhaus</span>
                      )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="board-aside">
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

          <section className="panel panel-feed">
            <div className="panel-head compact">
              <h2>Aktivität</h2>
            </div>
            <ul className="feed-list">
              {events.slice(0, 6).map((ev) => (
                <li key={ev.id}>
                  <span className="feed-type">{ev.type}</span>
                  <span className="feed-detail">
                    {ev.sterbefallId}
                    {ev.aktuellePosition && ` · ${ev.aktuellePosition}`}
                  </span>
                </li>
              ))}
              {events.length === 0 && <li className="feed-empty">Noch keine Events</li>}
            </ul>
          </section>
        </aside>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Alle Fälle</h2>
            <p>Verlauf und Endziel — Erde: Beisetzung · Urne: Krematorium</p>
          </div>
          <span className="panel-badge">{sterbefaelle.length} Fälle</span>
        </div>
        <div className="case-list">
          {sterbefaelle.map((s) => {
            const open = expandedId === s.id;
            return (
              <div key={s.id} className={`case-card ${open ? 'open' : ''}`}>
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
    </div>
  );
}
