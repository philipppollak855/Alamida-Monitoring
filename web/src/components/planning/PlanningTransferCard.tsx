import type { PlanningCard } from '../../planning/types';
import {
  freigabeLabel,
  isKremationPlanningCard,
  isUeberfuehrungFahrtCard,
} from '../../planning/transferPlanning';
import { isKremationTransferCard } from '../../planning/planningPersonnel';
import { EndzielChip, SchrittBadge, StatusChip } from '../../ui/SchrittBadge';
import { RouteFlow } from '../../ui/RouteFlow';

type Props = {
  card: PlanningCard;
  dragging?: boolean;
  personnelLine?: string | null;
  isDropTarget?: boolean;
  /** Tippen statt Drag (Mobile). */
  tapSelect?: boolean;
  onDragStart: (card: PlanningCard) => void;
  onDragEnd: () => void;
  onReset?: (card: PlanningCard) => void;
  onOpenPersonnel?: (card: PlanningCard) => void;
  onDragOverCard?: () => void;
  onDragLeaveCard?: () => void;
  onDropOnCard?: () => void;
};

export function PlanningTransferCard({
  card,
  dragging,
  personnelLine,
  isDropTarget,
  tapSelect,
  onDragStart,
  onDragEnd,
  onReset,
  onOpenPersonnel,
  onDragOverCard,
  onDragLeaveCard,
  onDropOnCard,
}: Props) {
  const attachedToCeremony =
    !isKremationPlanningCard(card) &&
    !card.detachedFromCeremony &&
    (Boolean(card.attachedCeremony) ||
      Boolean(
        card.plannedDayKey &&
          (card.ceremonies ?? []).some(
            (c) =>
              c.dayKey === card.plannedDayKey &&
              (c.kind === 'beisetzung' ||
                c.kind === 'verabschiedung' ||
                c.kind === 'trauerfeier')
          )
      ));

  const undoTitle = card.canUndoUmplanung
    ? 'Umplanung rückgängig'
    : 'Zurück zum Abholort / Ort';

  const kremationCompact = isKremationTransferCard(card);
  const acceptGroupDrop =
    Boolean(onDropOnCard) &&
    !attachedToCeremony &&
    (isKremationPlanningCard(card) || isUeberfuehrungFahrtCard(card));
  const canBookPersonnel =
    Boolean(onOpenPersonnel) &&
    Boolean(card.plannedDayKey) &&
    !attachedToCeremony &&
    !kremationCompact;
  const showStatusChip =
    !kremationCompact &&
    (card.istAbholungVomSterbeort
      ? card.schrittTyp.trim().toLowerCase() !== 'abholung'
      : true);
  const compactTransferSingle =
    !kremationCompact &&
    ['abholung', 'ueberfuehrung'].includes(card.schrittTyp.trim().toLowerCase());

  return (
    <article
      className={`plan-card transfer-${card.schrittTyp} status-${card.status}${
        card.erledigt ? ' is-erledigt' : ''
      }${dragging ? ' is-dragging' : ''}${card.hasManualPlan ? ' is-planned' : ''}${
        card.source === 'canvas' ? ' is-canvas' : ''
      }${card.targetsEigenerKr ? ' is-to-kr' : ''}${
        card.leavesEigenerKr && !card.targetsEigenerKr ? ' is-from-kr' : ''
      }${attachedToCeremony ? ' is-attached' : ''}${
        kremationCompact ? ' is-kremation-compact' : ''
      }${compactTransferSingle ? ' is-transfer-single-compact' : ''}${
        isDropTarget ? ' is-drop-target' : ''
      }${
        tapSelect && !card.erledigt ? ' is-tap-select' : ''
      } freigabe-${card.freigabeState ?? 'offen'}`}
      draggable={!card.erledigt && !tapSelect}
      onClick={
        tapSelect && !card.erledigt
          ? () => onDragStart(card)
          : undefined
      }
      onDragStart={
        !card.erledigt && !tapSelect
          ? (e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', card.id);
              onDragStart(card);
            }
          : undefined
      }
      onDragEnd={!tapSelect ? onDragEnd : undefined}
      onDragOver={
        acceptGroupDrop
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onDragOverCard?.();
            }
          : undefined
      }
      onDragLeave={
        acceptGroupDrop
          ? (e) => {
              e.stopPropagation();
              onDragLeaveCard?.();
            }
          : undefined
      }
      onDrop={
        acceptGroupDrop
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onDropOnCard?.();
            }
          : undefined
      }
    >
      <div className="plan-card-top">
        <span
          className="plan-card-grip"
          aria-hidden
          title={tapSelect ? 'Tippen zum Auswählen' : 'Ziehen zum Verschieben'}
        >
          {tapSelect ? '◎' : '⠿'}
        </span>
        <SchrittBadge typ={card.schrittTyp} />
        {showStatusChip && (
          <StatusChip
            status={card.istAbholungVomSterbeort ? 'abholung_noetig' : card.status}
            highlight={card.status === 'heute'}
          />
        )}
        {kremationCompact && card.plannedZeit && (
          <span className="plan-card-tag plan-card-tag--time">{card.plannedZeit}</span>
        )}
        {acceptGroupDrop && (
          <span className="plan-krem-drop-hint">+ Fahrt</span>
        )}
      </div>

      <div className="plan-card-person">
        <span className="plan-card-name">{card.name}</span>
        {!kremationCompact && <span className="plan-card-id">{card.sterbefallId}</span>}
      </div>

      {!kremationCompact && (
        <div className="plan-card-route-wrap">
          <RouteFlow von={card.vonOrt} nach={card.nachOrt} />
        </div>
      )}

      {!kremationCompact && (
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
              {c.zeit
                ? ` ${c.zeit}`
                : c.relativeLabel
                  ? ` ${c.relativeLabel}`
                  : c.datum
                    ? ` ${c.datum}`
                    : ''}
              {c.ort ? ` · ${c.ort}` : ''}
              {c.bestattungsMarker ? ` · ${c.bestattungsMarker}` : ''}
            </span>
          ))}
          {attachedToCeremony ? (
            <span className="plan-ceremony-chip" title="Personal über den zugehörigen Feiertermin">
              zugehörig · kein Extra-Personal
            </span>
          ) : null}
          {!attachedToCeremony && personnelLine ? (
            <span className="plan-ceremony-chip plan-personnel-chip" title={personnelLine}>
              {personnelLine}
            </span>
          ) : null}
          {!attachedToCeremony && !personnelLine && canBookPersonnel ? (
            <span className="plan-ceremony-chip plan-personnel-chip is-open">Fahrer offen</span>
          ) : null}
          <EndzielChip typ={card.endzielTyp} ort={card.endziel} />
        </div>
      )}

      <div className="plan-card-foot">
        {!kremationCompact && <time className="plan-card-date">{card.terminAm}</time>}
        {!kremationCompact && card.plannedZeit && (
          <span className="plan-card-tag plan-card-tag--time">{card.plannedZeit}</span>
        )}
        {card.targetsEigenerKr && <span className="plan-card-tag plan-card-tag--in">→ KR</span>}
        {card.leavesEigenerKr && !card.targetsEigenerKr && !kremationCompact && (
          <span className="plan-card-tag plan-card-tag--out">KR frei</span>
        )}
        {canBookPersonnel && (
          <button
            type="button"
            className="plan-personnel-btn"
            title="Fahrer für Überführung planen"
            onClick={(e) => {
              e.stopPropagation();
              onOpenPersonnel?.(card);
            }}
          >
            Fahrer
          </button>
        )}
        {(card.hasManualPlan || card.plannedDayKey != null) && onReset && (
          <button
            type="button"
            className={`plan-reset-btn${card.canUndoUmplanung ? ' is-undo' : ''}`}
            title={undoTitle}
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
