import type { PlanningCard } from '../../planning/types';
import { SchrittBadge, StatusChip } from '../../ui/SchrittBadge';
import { RouteFlow } from '../../ui/RouteFlow';

type Props = {
  card: PlanningCard;
  dragging?: boolean;
  onDragStart: (card: PlanningCard) => void;
  onDragEnd: () => void;
};

export function PlanningTransferCard({ card, dragging, onDragStart, onDragEnd }: Props) {
  return (
    <article
      className={`plan-card transfer-${card.schrittTyp} status-${card.status}${
        card.erledigt ? ' is-erledigt' : ''
      }${dragging ? ' is-dragging' : ''}${card.hasManualPlan ? ' is-planned' : ''}`}
      draggable={!card.erledigt}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.id);
        onDragStart(card);
      }}
      onDragEnd={onDragEnd}
    >
      <div className="plan-card-top">
        <span className="plan-card-grip" aria-hidden title="Ziehen zum Verschieben">
          ⠿
        </span>
        <SchrittBadge typ={card.schrittTyp} />
        <StatusChip
          status={card.istAbholungVomSterbeort ? 'abholung_noetig' : card.status}
          highlight={card.status === 'heute'}
        />
      </div>
      <div className="plan-card-person">
        <span className="plan-card-name">{card.name}</span>
        <span className="plan-card-id">{card.sterbefallId}</span>
      </div>
      <RouteFlow von={card.vonOrt} nach={card.nachOrt} />
      <div className="plan-card-foot">
        <time className="plan-card-date" title="Termin aus Alamida">
          {card.terminAm}
        </time>
        {card.targetsEigenerKr && <span className="plan-card-tag plan-card-tag--in">→ KR</span>}
        {card.leavesEigenerKr && !card.targetsEigenerKr && (
          <span className="plan-card-tag plan-card-tag--out">KR →</span>
        )}
      </div>
    </article>
  );
}
