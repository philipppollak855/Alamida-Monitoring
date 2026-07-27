import type { CeremonyInfo, KuehlraumDayCapacity, PlanningCard } from '../../planning/types';
import type { PersonnelBooking } from '../../types/personnelBooking';
import { isAttachableCeremonyKind } from '../../planning/transferPlanning';
import { PlanningTransferCard } from './PlanningTransferCard';
import { PlanningCapacityMeters } from './PlanningCapacityMeters';
import { WallCalBestattungsBadge } from '../WallCalBestattungsBadge';

type DayCeremony = {
  docId: string;
  name: string;
  ceremony: CeremonyInfo;
  booking?: PersonnelBooking | null;
  personnelLine?: string | null;
  needsLine?: string | null;
};

type Props = {
  dayKey: string;
  title: string;
  isToday?: boolean;
  transfers: PlanningCard[];
  ceremonies: DayCeremony[];
  capacities: KuehlraumDayCapacity[];
  isDropTarget: boolean;
  ceremonyDropKey?: string | null;
  draggingId: string | null;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onCardDragStart: (card: PlanningCard) => void;
  onCardDragEnd: () => void;
  onResetCard: (card: PlanningCard) => void;
  onCeremonyClick?: (ceremony: DayCeremony) => void;
  onCeremonyDragOver?: (ceremony: DayCeremony) => void;
  onCeremonyDragLeave?: () => void;
  onDropOnCeremony?: (ceremony: DayCeremony) => void;
  onOpenPersonnel?: (card: PlanningCard) => void;
  personnelByCardId?: Record<string, string | null>;
};

function ceremonyKindLabel(kind: CeremonyInfo['kind']): string {
  switch (kind) {
    case 'beisetzung':
      return 'Beisetzung';
    case 'trauerfeier':
      return 'Trauerfeier';
    case 'kremation':
      return 'Kremation';
    default:
      return 'Verabschiedung';
  }
}

function ceremonyTimeSortKey(c: CeremonyInfo): number {
  const z = c.zeit?.match(/(\d{1,2}):(\d{2})/);
  if (z) return +z[1] * 60 + +z[2];
  if (c.zeit?.toLowerCase().includes('anschluss')) return 24 * 60;
  return 25 * 60;
}

function ceremonyDropId(c: DayCeremony): string {
  return `${c.docId}|${c.ceremony.kind}|${c.ceremony.dayKey ?? ''}|${c.ceremony.zeit ?? ''}`;
}

export function PlanningCenterDay({
  dayKey,
  title,
  isToday,
  transfers,
  ceremonies,
  capacities,
  isDropTarget,
  ceremonyDropKey,
  draggingId,
  onDragOver,
  onDragLeave,
  onDrop,
  onCardDragStart,
  onCardDragEnd,
  onResetCard,
  onCeremonyClick,
  onCeremonyDragOver,
  onCeremonyDragLeave,
  onDropOnCeremony,
  onOpenPersonnel,
  personnelByCardId,
}: Props) {
  const sortedCeremonies = [...ceremonies].sort(
    (a, b) => ceremonyTimeSortKey(a.ceremony) - ceremonyTimeSortKey(b.ceremony)
  );

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

      <div className="plan-center-day-body">
        {sortedCeremonies.length > 0 && (
          <ul className="plan-center-ceremonies" aria-label="Termine an diesem Tag">
            {sortedCeremonies.map((c) => {
              const { ceremony } = c;
              const when =
                ceremony.zeit ||
                (!isToday && ceremony.relativeLabel ? ceremony.relativeLabel : null) ||
                ceremony.datum ||
                null;
              const clickable = Boolean(onCeremonyClick);
              const acceptDrop =
                Boolean(onDropOnCeremony) && isAttachableCeremonyKind(ceremony.kind);
              const dropKey = ceremonyDropId(c);
              const isCeremonyDrop = acceptDrop && ceremonyDropKey === dropKey;
              const content = (
                <>
                  <div className="plan-center-ceremony-top">
                    <span className={`plan-ceremony-kind is-${ceremony.kind}`}>
                      {ceremonyKindLabel(ceremony.kind)}
                    </span>
                    {ceremony.bestattungsMarker && (
                      <WallCalBestattungsBadge marker={ceremony.bestattungsMarker} />
                    )}
                    {when && <span className="plan-center-ceremony-when">{when}</span>}
                  </div>
                  <strong className="plan-center-ceremony-name" title={c.name}>
                    {c.name}
                  </strong>
                  {ceremony.ort && (
                    <span className="plan-center-ceremony-ort" title={ceremony.ort}>
                      {ceremony.ort}
                    </span>
                  )}
                  {c.needsLine && (
                    <span className="plan-center-ceremony-needs" title={c.needsLine}>
                      {c.needsLine}
                    </span>
                  )}
                  {c.personnelLine ? (
                    <span className="plan-center-ceremony-personnel" title={c.personnelLine}>
                      {c.personnelLine}
                    </span>
                  ) : (
                    <span className="plan-center-ceremony-personnel is-open">Personal offen</span>
                  )}
                  {acceptDrop && (
                    <span className="plan-center-ceremony-drop-hint">
                      Überführung hierher ziehen
                    </span>
                  )}
                </>
              );

              return (
                <li
                  key={dropKey}
                  className={`plan-center-ceremony is-${ceremony.kind}${
                    clickable ? ' is-clickable' : ''
                  }${isCeremonyDrop ? ' is-drop-target' : ''}${
                    acceptDrop ? ' is-droppable' : ''
                  }`}
                  onDragOver={
                    acceptDrop
                      ? (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onCeremonyDragOver?.(c);
                        }
                      : undefined
                  }
                  onDragLeave={
                    acceptDrop
                      ? (e) => {
                          e.stopPropagation();
                          onCeremonyDragLeave?.();
                        }
                      : undefined
                  }
                  onDrop={
                    acceptDrop
                      ? (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onDropOnCeremony?.(c);
                        }
                      : undefined
                  }
                >
                  {clickable ? (
                    <button
                      type="button"
                      className="plan-center-ceremony-btn"
                      onClick={() => onCeremonyClick?.(c)}
                    >
                      {content}
                    </button>
                  ) : (
                    content
                  )}
                </li>
              );
            })}
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
                personnelLine={personnelByCardId?.[card.id]}
                onDragStart={onCardDragStart}
                onDragEnd={onCardDragEnd}
                onReset={onResetCard}
                onOpenPersonnel={onOpenPersonnel}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}
