import type { CeremonyInfo, KuehlraumDayCapacity, PlanningCard } from '../../planning/types';
import { PlanningTransferCard } from './PlanningTransferCard';
import { PlanningCapacityMeters } from './PlanningCapacityMeters';

type DayCeremony = {
  docId: string;
  name: string;
  ceremony: CeremonyInfo;
};

type Props = {
  dayKey: string;
  title: string;
  isToday?: boolean;
  transfers: PlanningCard[];
  ceremonies: DayCeremony[];
  capacities: KuehlraumDayCapacity[];
  isDropTarget: boolean;
  draggingId: string | null;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onCardDragStart: (card: PlanningCard) => void;
  onCardDragEnd: () => void;
  onResetCard: (card: PlanningCard) => void;
};

export function PlanningCenterDay({
  dayKey,
  title,
  isToday,
  transfers,
  ceremonies,
  capacities,
  isDropTarget,
  draggingId,
  onDragOver,
  onDragLeave,
  onDrop,
  onCardDragStart,
  onCardDragEnd,
  onResetCard,
}: Props) {
  return (
    <section
      className={`plan-center-day${isToday ? ' is-today' : ''}${isDropTarget ? ' is-drop-target' : ''}`}
      data-day={dayKey}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
    >
      <header className="plan-center-day-head">
        <div>
          <h3>{title}</h3>
          {isToday && <p>Heute</p>}
        </div>
        <span className="plan-column-count">{transfers.length}</span>
      </header>

      {capacities.length > 0 && <PlanningCapacityMeters capacities={capacities} />}

      {ceremonies.length > 0 && (
        <ul className="plan-center-ceremonies">
          {ceremonies.map((c) => (
            <li key={`${c.docId}-${c.ceremony.kind}-${c.ceremony.datum}`}>
              <span className={`plan-ceremony-kind is-${c.ceremony.kind}`}>
                {c.ceremony.kind === 'beisetzung'
                  ? 'Beisetzung'
                  : c.ceremony.kind === 'trauerfeier'
                    ? 'Trauerfeier'
                    : c.ceremony.kind === 'kremation'
                      ? 'Kremation'
                      : 'Verabschiedung'}
              </span>
              <strong>{c.name}</strong>
              <span>{c.ceremony.zeit || c.ceremony.datum}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="plan-column-cards">
        {transfers.length === 0 ? (
          <p className="plan-column-empty">Überführung hierher ziehen (X → Y)</p>
        ) : (
          transfers.map((card) => (
            <PlanningTransferCard
              key={card.id}
              card={card}
              dragging={draggingId === card.id}
              onDragStart={onCardDragStart}
              onDragEnd={onCardDragEnd}
              onReset={onResetCard}
            />
          ))
        )}
      </div>
    </section>
  );
}
