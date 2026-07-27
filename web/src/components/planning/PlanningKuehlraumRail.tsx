import type { KuehlraumRailState } from '../../planning/types';
import { formatDayLabelDe } from '../../board/dateUtils';
import { formatTerminDisplay, freigabeLabel } from '../../planning/transferPlanning';

type Props = {
  rails: KuehlraumRailState[];
  dropTargetId: string | null;
  onDragOver: (kuehlraumId: string) => void;
  onDragLeave: (kuehlraumId: string) => void;
  onDrop: (kuehlraumId: string) => void;
};

export function PlanningKuehlraumRail({
  rails,
  dropTargetId,
  onDragOver,
  onDragLeave,
  onDrop,
}: Props) {
  return (
    <aside className="plan-rail plan-rail--kuehlraum" aria-label="Eigene Kühlräume">
      <header className="plan-rail-head">
        <h2>Kühlräume</h2>
        <p>Ressourcen & freie Plätze</p>
      </header>

      <div className="plan-rail-body">
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

            return (
              <section
                key={kr.id}
                className={`plan-kr-panel${active ? ' is-drop-target' : ''}${
                  kr.overbooked ? ' is-overbooked' : ''
                }`}
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
                <header className="plan-kr-panel-head">
                  <div>
                    <h3>{kr.label}</h3>
                    {kr.alamidaName && <p>{kr.alamidaName}</p>}
                  </div>
                  <span className="plan-kr-panel-cap">
                    {projected}/{kr.plaetze}
                  </span>
                </header>

                <div className="plan-capacity-bar" role="meter" aria-valuenow={projected} aria-valuemax={kr.plaetze}>
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

                <p className="plan-kr-drop-hint">Fall hierher ziehen → Termin planen</p>

                {kr.occupants.length > 0 && (
                  <ul className="plan-kr-occupants">
                    {kr.occupants.map((occ) => (
                      <li key={occ.docId} className={`plan-kr-occupant freigabe-${occ.freigabeState}`}>
                        <div className="plan-kr-occupant-main">
                          <span className="plan-kr-occupant-platz">P{occ.platz}</span>
                          <strong>{occ.name}</strong>
                        </div>
                        <span className={`plan-freigabe-chip is-${occ.freigabeState}`}>
                          {freigabeLabel(occ.freigabeState, occ.freigabeDatum)}
                        </span>
                        {occ.nextCeremony && (
                          <span className="plan-ceremony-chip">
                            {occ.nextCeremony.relativeLabel || occ.nextCeremony.datum}
                          </span>
                        )}
                        {occ.freesOnDayKey && (
                          <span className="plan-free-chip">
                            frei {formatDayLabelDe(occ.freesOnDayKey)}
                            {occ.freesReason ? ` (${occ.freesReason})` : ''}
                          </span>
                        )}
                      </li>
                    ))}
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
              </section>
            );
          })
        )}
      </div>
    </aside>
  );
}
