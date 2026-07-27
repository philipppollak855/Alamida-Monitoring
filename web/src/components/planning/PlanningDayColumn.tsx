import type { PlanningCard } from '../../planning/types';
import { PlanningTransferCard } from './PlanningTransferCard';
import { PlanningCapacityMeters } from './PlanningCapacityMeters';
import type { KuehlraumDayCapacity } from '../../planning/types';

type Props = {
  dayKey: string | null;
  title: string;
  subtitle?: string;
  cards: PlanningCard[];
  capacities?: KuehlraumDayCapacity[];
  isDropTarget: boolean;
  draggingId: string | null;
  onDragOverLane: () => void;
  onDragLeaveLane: () => void;
  onDropLane: () => void;
  onCardDragStart: (card: PlanningCard) => void;
  onCardDragEnd: () => void;
  emptyHint: string;
};

export function PlanningDayColumn({
  dayKey,
  title,
  subtitle,
  cards,
  capacities,
  isDropTarget,
  draggingId,
  onDragOverLane,
  onDragLeaveLane,
  onDropLane,
  onCardDragStart,
  onCardDragEnd,
  emptyHint,
}: Props) {
  return (
    <section
      className={`plan-column${dayKey == null ? ' plan-column--backlog' : ''}${
        isDropTarget ? ' is-drop-target' : ''
      }`}
      data-day={dayKey ?? 'backlog'}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOverLane();
      }}
      onDragLeave={onDragLeaveLane}
      onDrop={(e) => {
        e.preventDefault();
        onDropLane();
      }}
    >
      <header className="plan-column-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <span className="plan-column-count">{cards.length}</span>
      </header>

      {capacities && capacities.length > 0 && <PlanningCapacityMeters capacities={capacities} />}

      <div className="plan-column-cards">
        {cards.length === 0 ? (
          <p className="plan-column-empty">{emptyHint}</p>
        ) : (
          cards.map((card) => (
            <PlanningTransferCard
              key={card.id}
              card={card}
              dragging={draggingId === card.id}
              onDragStart={onCardDragStart}
              onDragEnd={onCardDragEnd}
            />
          ))
        )}
      </div>
    </section>
  );
}
