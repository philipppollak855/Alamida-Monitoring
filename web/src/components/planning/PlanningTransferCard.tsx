import type { PlanningCard } from '../../planning/types';
import { freigabeLabel } from '../../planning/transferPlanning';
import { EndzielChip, SchrittBadge, StatusChip } from '../../ui/SchrittBadge';
import { RouteFlow } from '../../ui/RouteFlow';

type Props = {
  card: PlanningCard;
  dragging?: boolean;
  onDragStart: (card: PlanningCard) => void;
  onDragEnd: () => void;
  onReset?: (card: PlanningCard) => void;
};

export function PlanningTransferCard({
  card,
  dragging,
  onDragStart,
  onDragEnd,
  onReset,
}: Props) {
  return (
    <article
      className={`plan-card transfer-${card.schrittTyp} status-${card.status}${
        card.erledigt ? ' is-erledigt' : ''
      }${dragging ? ' is-dragging' : ''}${card.hasManualPlan ? ' is-planned' : ''}${
        card.source === 'canvas' ? ' is-canvas' : ''
      }${card.targetsEigenerKr ? ' is-to-kr' : ''}${
        card.leavesEigenerKr && !card.targetsEigenerKr ? ' is-from-kr' : ''
      } freigabe-${card.freigabeState ?? 'offen'}`}
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

      <div className="plan-card-route-wrap">
        <RouteFlow von={card.vonOrt} nach={card.nachOrt} />
      </div>

      <div className="plan-card-meta">
        {card.freigabeState && (
          <span className={`plan-freigabe-chip is-${card.freigabeState}`}>
            {freigabeLabel(card.freigabeState, card.freigabeDatum)}
          </span>
        )}
        {(card.ceremonies ?? []).slice(0, 2).map((c) => (
          <span key={`${c.kind}-${c.datum}`} className="plan-ceremony-chip" title={c.label}>
            {c.kind === 'beisetzung'
              ? 'Beisetzung'
              : c.kind === 'trauerfeier'
                ? 'TF'
                : c.kind === 'kremation'
                  ? 'Krem.'
                  : 'Verab.'}
            {c.zeit ? ` ${c.zeit}` : c.relativeLabel ? ` ${c.relativeLabel}` : c.datum ? ` ${c.datum}` : ''}
            {c.ort ? ` · ${c.ort}` : ''}
            {c.bestattungsMarker ? ` · ${c.bestattungsMarker}` : ''}
          </span>
        ))}
        <EndzielChip typ={card.endzielTyp} ort={card.endziel} />
      </div>

      <div className="plan-card-foot">
        <time className="plan-card-date">{card.terminAm}</time>
        {card.plannedZeit && (
          <span className="plan-card-tag plan-card-tag--time">{card.plannedZeit}</span>
        )}
        {card.targetsEigenerKr && <span className="plan-card-tag plan-card-tag--in">→ KR</span>}
        {card.leavesEigenerKr && !card.targetsEigenerKr && (
          <span className="plan-card-tag plan-card-tag--out">KR frei</span>
        )}
        {card.hasManualPlan && onReset && (
          <button
            type="button"
            className="plan-reset-btn"
            title="Planung zurücksetzen"
            onClick={(e) => {
              e.stopPropagation();
              onReset(card);
            }}
          >
            ↺
          </button>
        )}
      </div>
    </article>
  );
}
