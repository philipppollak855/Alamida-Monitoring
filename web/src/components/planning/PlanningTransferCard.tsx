import type { PlanningCard } from '../../planning/types';
import { freigabeLabel } from '../../planning/transferPlanning';
import { isKremationTransferCard } from '../../planning/planningPersonnel';
import { EndzielChip, SchrittBadge, StatusChip } from '../../ui/SchrittBadge';
import { RouteFlow } from '../../ui/RouteFlow';

type Props = {
  card: PlanningCard;
  dragging?: boolean;
  personnelLine?: string | null;
  onDragStart: (card: PlanningCard) => void;
  onDragEnd: () => void;
  onReset?: (card: PlanningCard) => void;
  onOpenPersonnel?: (card: PlanningCard) => void;
};

export function PlanningTransferCard({
  card,
  dragging,
  personnelLine,
  onDragStart,
  onDragEnd,
  onReset,
  onOpenPersonnel,
}: Props) {
  const attachedToCeremony =
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

  const kremationNoPersonnel = isKremationTransferCard(card);
  const canBookPersonnel =
    Boolean(onOpenPersonnel) &&
    Boolean(card.plannedDayKey) &&
    !attachedToCeremony &&
    !kremationNoPersonnel;

  return (
    <article
      className={`plan-card transfer-${card.schrittTyp} status-${card.status}${
        card.erledigt ? ' is-erledigt' : ''
      }${dragging ? ' is-dragging' : ''}${card.hasManualPlan ? ' is-planned' : ''}${
        card.source === 'canvas' ? ' is-canvas' : ''
      }${card.targetsEigenerKr ? ' is-to-kr' : ''}${
        card.leavesEigenerKr && !card.targetsEigenerKr ? ' is-from-kr' : ''
      }${attachedToCeremony ? ' is-attached' : ''} freigabe-${card.freigabeState ?? 'offen'}`}
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
        {attachedToCeremony ? (
          <span className="plan-ceremony-chip" title="Personal über den zugehörigen Feiertermin">
            zugehörig · kein Extra-Personal
          </span>
        ) : null}
        {kremationNoPersonnel && !attachedToCeremony ? (
          <span className="plan-ceremony-chip" title="Standard-Kremationsüberführung">
            kein Personal
          </span>
        ) : null}
        {!attachedToCeremony && !kremationNoPersonnel && personnelLine ? (
          <span className="plan-ceremony-chip plan-personnel-chip" title={personnelLine}>
            {personnelLine}
          </span>
        ) : null}
        {!attachedToCeremony && !kremationNoPersonnel && !personnelLine && canBookPersonnel ? (
          <span className="plan-ceremony-chip plan-personnel-chip is-open">Fahrer offen</span>
        ) : null}
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
