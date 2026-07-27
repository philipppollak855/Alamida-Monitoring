import type { PlanningCard } from '../../planning/types';
import type { KremationGroupView } from '../../planning/transferPlanning';

type Props = {
  group: KremationGroupView;
  draggingId: string | null;
  isDropTarget?: boolean;
  onCardDragStart: (card: PlanningCard) => void;
  onCardDragEnd: () => void;
  onDragOverGroup?: () => void;
  onDragLeaveGroup?: () => void;
  onDropOnGroup?: () => void;
  onResetCard?: (card: PlanningCard) => void;
};

export function PlanningKremationGroupCard({
  group,
  draggingId,
  isDropTarget,
  onCardDragStart,
  onCardDragEnd,
  onDragOverGroup,
  onDragLeaveGroup,
  onDropOnGroup,
  onResetCard,
}: Props) {
  const { host, members } = group;
  const zeit = members.map((m) => m.plannedZeit).find(Boolean) ?? host.plannedZeit;

  return (
    <article
      className={`plan-krem-group${isDropTarget ? ' is-drop-target' : ''}${
        members.some((m) => m.id === draggingId) ? ' has-dragging' : ''
      }`}
      onDragOver={
        onDropOnGroup
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onDragOverGroup?.();
            }
          : undefined
      }
      onDragLeave={
        onDropOnGroup
          ? (e) => {
              e.stopPropagation();
              onDragLeaveGroup?.();
            }
          : undefined
      }
      onDrop={
        onDropOnGroup
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onDropOnGroup();
            }
          : undefined
      }
    >
      <header className="plan-krem-group-head">
        <span className="plan-krem-group-label">Kremation</span>
        {zeit && <span className="plan-krem-group-time">{zeit}</span>}
        <span className="plan-krem-group-count">{members.length}</span>
      </header>
      <ul className="plan-krem-group-names">
        {members.map((card) => (
          <li
            key={card.id}
            className={`plan-krem-group-name${draggingId === card.id ? ' is-dragging' : ''}`}
            draggable={!card.erledigt}
            title={`${card.name} — Herausziehen trennt von der Fahrt`}
            onDragStart={(e) => {
              e.stopPropagation();
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', card.id);
              onCardDragStart(card);
            }}
            onDragEnd={onCardDragEnd}
          >
            <span className="plan-card-grip" aria-hidden>
              ⠿
            </span>
            <span className="plan-krem-group-name-text">{card.name}</span>
            {onResetCard && (card.hasManualPlan || card.plannedDayKey != null) && (
              <button
                type="button"
                className={`plan-reset-btn${card.canUndoUmplanung ? ' is-undo' : ''}`}
                title={
                  card.canUndoUmplanung
                    ? 'Umplanung rückgängig'
                    : 'Aus Fahrt lösen / zurücksetzen'
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onResetCard(card);
                }}
              >
                ↺
              </button>
            )}
          </li>
        ))}
      </ul>
      {onDropOnGroup && (
        <p className="plan-krem-group-hint">Kremation hierher ziehen zum Zusammenfassen</p>
      )}
    </article>
  );
}
