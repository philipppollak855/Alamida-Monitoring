import { useMemo, useState } from 'react';
import type { KuehlraumOccupant, KuehlraumRailState } from '../../planning/types';
import { formatDayLabelDe } from '../../board/dateUtils';
import {
  tageSeitFreigabeLabel,
  tageSeitFreigabeTitle,
} from '../../board/freigabeLogic';
import { formatTerminDisplay, freigabeLabel } from '../../planning/transferPlanning';

type Props = {
  rails: KuehlraumRailState[];
  dropTargetId: string | null;
  draggingId?: string | null;
  onDragOver: (kuehlraumId: string) => void;
  onDragLeave: (kuehlraumId: string) => void;
  onDrop: (kuehlraumId: string) => void;
  onOccupantDragStart?: (kr: KuehlraumRailState, occ: KuehlraumOccupant) => void;
  onOccupantDragEnd?: () => void;
};

export function PlanningKuehlraumRail({
  rails,
  dropTargetId,
  draggingId,
  onDragOver,
  onDragLeave,
  onDrop,
  onOccupantDragStart,
  onOccupantDragEnd,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const summary = useMemo(() => {
    const occupied = rails.reduce((n, r) => n + r.occupiedNow, 0);
    const plaetze = rails.reduce((n, r) => n + r.plaetze, 0);
    return { occupied, plaetze };
  }, [rails]);

  return (
    <aside className="plan-rail plan-rail--kuehlraum" aria-label="Eigene Kühlräume">
      <header className="plan-rail-head">
        <h2>Kühlräume</h2>
        <p>
          {rails.length} · {summary.occupied}/{summary.plaetze} belegt
        </p>
      </header>

      <div className="plan-rail-body plan-rail-body--accordion">
        {rails.length === 0 ? (
          <p className="plan-column-empty">Kein eigener Kühlraum konfiguriert</p>
        ) : (
          rails.map((kr) => {
            const projected = Math.max(
              0,
              kr.occupiedNow + kr.plannedArrivals - kr.plannedDepartures
            );
            const pct = kr.plaetze > 0 ? Math.min(100, (projected / kr.plaetze) * 100) : 0;
            const active = dropTargetId === kr.id;
            const expanded = expandedId === kr.id;

            return (
              <section
                key={kr.id}
                className={`plan-kr-panel${active ? ' is-drop-target' : ''}${
                  kr.overbooked ? ' is-overbooked' : ''
                }${expanded ? ' is-expanded' : ' is-collapsed'}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  onDragOver(kr.id);
                }}
                onDragLeave={() => onDragLeave(kr.id)}
                onDrop={(e) => {
                  e.preventDefault();
                  onDrop(kr.id);
                }}
              >
                <button
                  type="button"
                  className="plan-kr-panel-toggle"
                  aria-expanded={expanded}
                  onClick={() => setExpandedId((id) => (id === kr.id ? null : kr.id))}
                >
                  <header className="plan-kr-panel-head">
                    <div>
                      <h3>{kr.label}</h3>
                      {kr.alamidaName && <p>{kr.alamidaName}</p>}
                    </div>
                    <span className="plan-kr-panel-cap">
                      {projected}/{kr.plaetze}
                      <span className="plan-kr-panel-chevron" aria-hidden>
                        {expanded ? '▾' : '▸'}
                      </span>
                    </span>
                  </header>

                  <div
                    className="plan-capacity-bar"
                    role="meter"
                    aria-valuenow={projected}
                    aria-valuemax={kr.plaetze}
                  >
                    <span className="plan-capacity-fill" style={{ width: `${pct}%` }} />
                  </div>

                  <div className="plan-kr-panel-meta">
                    <span>{kr.occupiedNow} belegt</span>
                    {kr.plannedArrivals > 0 && (
                      <span className="plan-capacity-delta in">+{kr.plannedArrivals}</span>
                    )}
                    {kr.plannedDepartures > 0 && (
                      <span className="plan-capacity-delta out">−{kr.plannedDepartures}</span>
                    )}
                    {kr.overbooked ? (
                      <span className="plan-capacity-warn">Überbuchung</span>
                    ) : (
                      <span className="plan-capacity-idle">{Math.max(0, kr.free)} frei</span>
                    )}
                  </div>
                </button>

                {expanded && (
                  <div className="plan-kr-panel-body">
                    <p className="plan-kr-drop-hint">
                      Fall hierher ziehen → Termin planen · Belegung ziehen → anderer KR
                    </p>

                    {kr.occupants.length > 0 && (
                      <ul className="plan-kr-occupants">
                        {kr.occupants.map((occ) => {
                          const canDrag = Boolean(onOccupantDragStart);
                          return (
                            <li
                              key={occ.docId}
                              className={`plan-kr-occupant freigabe-${occ.freigabeState}${
                                canDrag ? ' is-draggable' : ''
                              }${draggingId === occ.docId ? ' is-dragging' : ''}`}
                              draggable={canDrag}
                              onDragStart={
                                canDrag
                                  ? (e) => {
                                      e.stopPropagation();
                                      e.dataTransfer.effectAllowed = 'move';
                                      e.dataTransfer.setData('text/plain', occ.docId);
                                      onOccupantDragStart?.(kr, occ);
                                    }
                                  : undefined
                              }
                              onDragEnd={canDrag ? onOccupantDragEnd : undefined}
                            >
                              <div className="plan-kr-occupant-main">
                                {canDrag && (
                                  <span className="plan-card-grip" aria-hidden>
                                    ⠿
                                  </span>
                                )}
                                <span className="plan-kr-occupant-platz">P{occ.platz}</span>
                                <strong title={occ.name}>{occ.name}</strong>
                                {kr.zeigeTageSeitFreigabe &&
                                  occ.tageSeitFreigabe != null &&
                                  occ.tageSeitFreigabe > 0 && (
                                    <span
                                      className="plan-freigabe-tage-chip"
                                      title={tageSeitFreigabeTitle(
                                        occ.tageSeitFreigabe,
                                        occ.freigabeDatum
                                      )}
                                    >
                                      {tageSeitFreigabeLabel(occ.tageSeitFreigabe)}
                                    </span>
                                  )}
                              </div>
                              <span className={`plan-freigabe-chip is-${occ.freigabeState}`}>
                                {freigabeLabel(occ.freigabeState, occ.freigabeDatum)}
                              </span>
                              {occ.nextCeremony && (
                                <span className="plan-ceremony-chip" title={occ.nextCeremony.label}>
                                  {occ.nextCeremony.kind === 'beisetzung'
                                    ? 'Beisetzung'
                                    : occ.nextCeremony.kind === 'trauerfeier'
                                      ? 'Trauerfeier'
                                      : occ.nextCeremony.kind === 'kremation'
                                        ? 'Kremation'
                                        : 'Verabschiedung'}
                                  {occ.nextCeremony.zeit
                                    ? ` ${occ.nextCeremony.zeit}`
                                    : occ.nextCeremony.relativeLabel
                                      ? ` ${occ.nextCeremony.relativeLabel}`
                                      : ''}
                                  {occ.nextCeremony.ort ? ` · ${occ.nextCeremony.ort}` : ''}
                                </span>
                              )}
                              {occ.freesOnDayKey && (
                                <span className="plan-free-chip">
                                  frei {formatDayLabelDe(occ.freesOnDayKey)}
                                  {occ.freesReason ? ` (${occ.freesReason})` : ''}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {kr.slotFrees.length > 0 && (
                      <div className="plan-kr-frees">
                        <h4>Platz frei</h4>
                        <ul>
                          {kr.slotFrees.slice(0, 5).map((f) => (
                            <li key={`${f.docId}-${f.dayKey}-${f.reason}`}>
                              <strong>{f.name}</strong>
                              <span>
                                {formatTerminDisplay(f.dayKey, f.zeit)} · {f.reason}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
    </aside>
  );
}
