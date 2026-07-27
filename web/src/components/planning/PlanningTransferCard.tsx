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
      }${dragging ? ' is-dragging' : ''}${card.hasManualPlan ? ' is-planned' : ''}${
        card.source === 'canvas' ? ' is-canvas' : ''
      }${card.targetsEigenerKr ? ' is-to-kr' : ''}`}
      draggable={!card.erledigt}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.id);
        e.dataTransfer.setData('application/x-plan-kind', 'card');
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
        {card.source === 'canvas' && <span className="plan-card-tag plan-card-tag--canvas">Canvas</span>}
      </div>
      <div className="plan-card-person">
        <span className="plan-card-name">{card.name}</span>
        <span className="plan-card-id">{card.sterbefallId}</span>
      </div>
      <div className="plan-card-route-wrap">
        <RouteFlow von={card.vonOrt} nach={card.nachOrt} />
      </div>
      <div className="plan-card-foot">
        <time className="plan-card-date" title="Geplanter Termin">
          {card.terminAm}
        </time>
        {card.plannedZeit && <span className="plan-card-tag plan-card-tag--time">{card.plannedZeit}</span>}
        {card.targetsEigenerKr && <span className="plan-card-tag plan-card-tag--in">→ KR</span>}
        {card.leavesEigenerKr && !card.targetsEigenerKr && (
          <span className="plan-card-tag plan-card-tag--out">KR →</span>
        )}
      </div>
    </article>
  );
}
