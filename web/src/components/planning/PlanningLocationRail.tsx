import type { LocationGroup, SterbeortPoolItem } from '../../planning/types';
import { freigabeLabel } from '../../planning/transferPlanning';
import {
  tageSeitFreigabeLabel,
  tageSeitFreigabeTitle,
} from '../../board/freigabeLogic';

type Props = {
  groups: LocationGroup[];
  draggingId: string | null;
  isDropTarget?: boolean;
  onDragStart: (item: SterbeortPoolItem) => void;
  onDragEnd: () => void;
  onDragOver?: () => void;
  onDragLeave?: () => void;
  onDrop?: () => void;
};

export function PlanningLocationRail({
  groups,
  draggingId,
  isDropTarget,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: Props) {
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const acceptDrop = Boolean(onDrop);

  return (
    <aside
      className={`plan-rail plan-rail--locations${isDropTarget ? ' is-drop-target' : ''}`}
      aria-label="Aktuelle Orte"
      onDragOver={
        acceptDrop
          ? (e) => {
              e.preventDefault();
              onDragOver?.();
            }
          : undefined
      }
      onDragLeave={acceptDrop ? onDragLeave : undefined}
      onDrop={
        acceptDrop
          ? (e) => {
              e.preventDefault();
              onDrop?.();
            }
          : undefined
      }
    >
      <header className="plan-rail-head">
        <h2>Aktuelle Orte</h2>
        <p>Sterbeort / Standort / Kühlraum</p>
        <span className="plan-rail-count">{total}</span>
        {acceptDrop && (
          <p className="plan-rail-drop-hint">
            {isDropTarget ? 'Hier ablegen → zurück zum Ort' : 'Überführung hierher = Abholort'}
          </p>
        )}
      </header>

      <div className="plan-rail-body">
        {groups.length === 0 ? (
          <p className="plan-column-empty">Keine Fälle außerhalb des Kühlraums</p>
        ) : (
          groups.map((group) => (
            <section
              key={group.key}
              className={`plan-location-group${
                group.kind === 'kuehlraum' ? ' is-kuehlraum' : ''
              }`}
            >
              <h3 className="plan-location-group-title">
                <span>
                  {group.kind === 'kuehlraum' ? (
                    <em className="plan-location-kr-badge">KR</em>
                  ) : null}
                  {group.label}
                </span>
                <span className="plan-location-group-count">{group.items.length}</span>
              </h3>
              <div className="plan-location-group-cards">
                {group.items.length === 0 ? (
                  <p className="plan-column-empty">Leer</p>
                ) : (
                  group.items.map((item) => {
                    const canDrag = item.displayOnly !== true;
                    return (
                      <article
                        key={item.docId}
                        className={`plan-source-card freigabe-${item.freigabeState}${
                          draggingId === item.docId ? ' is-dragging' : ''
                        }${item.displayOnly ? ' is-display-only' : ''}`}
                        draggable={canDrag}
                        onDragStart={
                          canDrag
                            ? (e) => {
                                e.dataTransfer.effectAllowed = 'move';
                                e.dataTransfer.setData('text/plain', item.docId);
                                onDragStart(item);
                              }
                            : undefined
                        }
                        onDragEnd={canDrag ? onDragEnd : undefined}
                      >
                        <div className="plan-source-top">
                          {canDrag && (
                            <span className="plan-card-grip" aria-hidden>
                              ⠿
                            </span>
                          )}
                          <span className={`plan-freigabe-chip is-${item.freigabeState}`}>
                            {freigabeLabel(item.freigabeState, item.freigabeDatum)}
                          </span>
                          {item.tageSeitFreigabe != null && item.tageSeitFreigabe > 0 && (
                            <span
                              className="plan-freigabe-tage-chip"
                              title={tageSeitFreigabeTitle(
                                item.tageSeitFreigabe,
                                item.freigabeDatum
                              )}
                            >
                              {tageSeitFreigabeLabel(item.tageSeitFreigabe)}
                            </span>
                          )}
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
                    );
                  })
                )}
              </div>
            </section>
          ))
        )}
      </div>
    </aside>
  );
}
