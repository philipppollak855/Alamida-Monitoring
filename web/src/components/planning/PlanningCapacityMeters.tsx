import type { KuehlraumDayCapacity } from '../../planning/types';

type Props = {
  capacities: KuehlraumDayCapacity[];
};

export function PlanningCapacityMeters({ capacities }: Props) {
  if (capacities.length === 0) return null;

  return (
    <div className="plan-capacity-list" aria-label="Kühlraum-Ressourcen">
      {capacities.map((c) => {
        const pct = c.plaetze > 0 ? Math.min(100, (c.projectedOccupied / c.plaetze) * 100) : 0;
        return (
          <div
            key={c.kuehlraumId}
            className={`plan-capacity${c.overbooked ? ' is-overbooked' : ''}${
              c.free <= 1 && !c.overbooked ? ' is-tight' : ''
            }`}
          >
            <div className="plan-capacity-head">
              <span className="plan-capacity-label">{c.label}</span>
              <span className="plan-capacity-count">
                {c.projectedOccupied}/{c.plaetze}
              </span>
            </div>
            <div className="plan-capacity-bar" role="meter" aria-valuenow={c.projectedOccupied} aria-valuemax={c.plaetze}>
              <span className="plan-capacity-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="plan-capacity-meta">
              {c.arrivals > 0 && <span className="plan-capacity-delta in">+{c.arrivals}</span>}
              {c.departures > 0 && <span className="plan-capacity-delta out">−{c.departures}</span>}
              {c.overbooked && <span className="plan-capacity-warn">Überbuchung</span>}
              {!c.overbooked && c.arrivals === 0 && c.departures === 0 && (
                <span className="plan-capacity-idle">{c.free} frei</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
