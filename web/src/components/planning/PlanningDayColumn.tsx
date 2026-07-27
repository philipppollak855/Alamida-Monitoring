import type { KuehlraumDayCapacity, PlanningCard } from '../../planning/types';
import type { EigenerKuehlraumConfig } from '../../types/dispositionSettings';
import { PlanningTransferCard } from './PlanningTransferCard';
import { PlanningCapacityMeters } from './PlanningCapacityMeters';

type Props = {
  dayKey: string | null;
  title: string;
  subtitle?: string;
  cards: PlanningCard[];
  capacities?: KuehlraumDayCapacity[];
  kuehlraeume?: EigenerKuehlraumConfig[];
  /** Wenn gesetzt: Drop-Ziele je Kühlraum statt nur Tages-Spalte. */
  enableKuehlraumDrops?: boolean;
  isDropTarget: boolean;
  dropTargetKey?: string | null;
  draggingId: string | null;
  onDragOverLane: (laneKey: string) => void;
  onDragLeaveLane: (laneKey: string) => void;
  onDropLane: (laneKey: string, kuehlraumId?: string) => void;
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
  kuehlraeume = [],
  enableKuehlraumDrops = false,
  isDropTarget,
  dropTargetKey,
  draggingId,
  onDragOverLane,
  onDragLeaveLane,
  onDropLane,
  onCardDragStart,
  onCardDragEnd,
  emptyHint,
}: Props) {
  const laneKey = dayKey ?? 'backlog';

  return (
    <section
      className={`plan-column${dayKey == null ? ' plan-column--backlog' : ''}${
        isDropTarget && !enableKuehlraumDrops ? ' is-drop-target' : ''
      }`}
      data-day={laneKey}
      onDragOver={(e) => {
        if (enableKuehlraumDrops) return;
        e.preventDefault();
        onDragOverLane(laneKey);
      }}
      onDragLeave={() => {
        if (enableKuehlraumDrops) return;
        onDragLeaveLane(laneKey);
      }}
      onDrop={(e) => {
        if (enableKuehlraumDrops) return;
        e.preventDefault();
        onDropLane(laneKey);
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

      {enableKuehlraumDrops && dayKey && kuehlraeume.length > 0 ? (
        <div className="plan-kr-lanes">
          {kuehlraeume.map((kr) => {
            const krCards = cards.filter((c) => c.kuehlraumId === kr.id && c.targetsEigenerKr);
            const dropKey = `${dayKey}::${kr.id}`;
            const active = dropTargetKey === dropKey;
            return (
              <div
                key={kr.id}
                className={`plan-kr-lane${active ? ' is-drop-target' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDragOverLane(dropKey);
                }}
                onDragLeave={() => onDragLeaveLane(dropKey)}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDropLane(dayKey, kr.id);
                }}
              >
                <div className="plan-kr-lane-head">
                  <span>{kr.label}</span>
                  <span className="plan-kr-lane-count">{krCards.length}</span>
                </div>
                <div className="plan-column-cards">
                  {krCards.length === 0 ? (
                    <p className="plan-column-empty">Sterbefall hierher ziehen</p>
                  ) : (
                    krCards.map((card) => (
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
              </div>
            );
          })}
          {cards.filter((c) => !c.targetsEigenerKr || !c.kuehlraumId).length > 0 && (
            <div className="plan-column-cards plan-column-cards--other">
              {cards
                .filter((c) => !c.targetsEigenerKr || !c.kuehlraumId)
                .map((card) => (
                  <PlanningTransferCard
                    key={card.id}
                    card={card}
                    dragging={draggingId === card.id}
                    onDragStart={onCardDragStart}
                    onDragEnd={onCardDragEnd}
                  />
                ))}
            </div>
          )}
        </div>
      ) : (
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
      )}
    </section>
  );
}
