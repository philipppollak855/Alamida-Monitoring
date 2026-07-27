import type { LocationGroup, SterbeortPoolItem } from '../../planning/types';
import { freigabeLabel } from '../../planning/transferPlanning';

type Props = {
  groups: LocationGroup[];
  draggingId: string | null;
  onDragStart: (item: SterbeortPoolItem) => void;
  onDragEnd: () => void;
};

export function PlanningLocationRail({ groups, draggingId, onDragStart, onDragEnd }: Props) {
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <aside className="plan-rail plan-rail--locations" aria-label="Aktuelle Orte">
      <header className="plan-rail-head">
        <h2>Aktuelle Orte</h2>
        <p>Sterbeort / derzeitiger Standort</p>
        <span className="plan-rail-count">{total}</span>
      </header>

      <div className="plan-rail-body">
        {groups.length === 0 ? (
          <p className="plan-column-empty">Keine Fälle außerhalb des Kühlraums</p>
        ) : (
          groups.map((group) => (
            <section key={group.key} className="plan-location-group">
              <h3 className="plan-location-group-title">
                <span>{group.label}</span>
                <span className="plan-location-group-count">{group.items.length}</span>
              </h3>
              <div className="plan-location-group-cards">
                {group.items.map((item) => (
                  <article
                    key={item.docId}
                    className={`plan-source-card freigabe-${item.freigabeState}${
                      draggingId === item.docId ? ' is-dragging' : ''
                    }`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', item.docId);
                      onDragStart(item);
                    }}
                    onDragEnd={onDragEnd}
                  >
                    <div className="plan-source-top">
                      <span className="plan-card-grip" aria-hidden>
                        ⠿
                      </span>
                      <span className={`plan-freigabe-chip is-${item.freigabeState}`}>
                        {freigabeLabel(item.freigabeState, item.freigabeDatum)}
                      </span>
                    </div>
                    <strong className="plan-source-name">{item.name}</strong>
                    <span className="plan-source-id">{item.sterbefallId}</span>
                    {item.nextCeremony && (
                      <span className="plan-ceremony-chip" title={item.nextCeremony.label}>
                        {item.nextCeremony.kind === 'beisetzung'
                          ? 'Beisetzung'
                          : item.nextCeremony.kind === 'trauerfeier'
                            ? 'Trauerfeier'
                            : item.nextCeremony.kind === 'kremation'
                              ? 'Kremation'
                              : 'Verabschiedung'}
                        {item.nextCeremony.zeit
                          ? ` · ${item.nextCeremony.zeit}`
                          : item.nextCeremony.relativeLabel
                            ? ` · ${item.nextCeremony.relativeLabel}`
                            : ''}
                        {item.nextCeremony.ort ? ` · ${item.nextCeremony.ort}` : ''}
                      </span>
                    )}
                    {item.endziel && (
                      <span className="plan-endziel-chip">{item.endziel}</span>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </aside>
  );
}
