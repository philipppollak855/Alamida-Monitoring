import type { CeremonyInfo, KuehlraumDayCapacity, PlanningCard } from '../../planning/types';
import type { PersonnelBooking } from '../../types/personnelBooking';
import type { PlanningDayAbsence } from '../../planning/planningPersonnel';
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
  transferPersonnelLines?: Record<string, string | null>;
  ceremonies: DayCeremony[];
  absences?: PlanningDayAbsence[];
  capacities: KuehlraumDayCapacity[];
  isDropTarget: boolean;
  draggingId: string | null;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onCardDragStart: (card: PlanningCard) => void;
  onCardDragEnd: () => void;
  onResetCard: (card: PlanningCard) => void;
  onCeremonyClick?: (ceremony: DayCeremony) => void;
  onTransferPersonnelClick?: (card: PlanningCard) => void;
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

export function PlanningCenterDay({
  dayKey,
  title,
  isToday,
  transfers,
  transferPersonnelLines = {},
  ceremonies,
  absences = [],
  capacities,
  isDropTarget,
  draggingId,
  onDragOver,
  onDragLeave,
  onDrop,
  onCardDragStart,
  onCardDragEnd,
  onResetCard,
  onCeremonyClick,
  onTransferPersonnelClick,
}: Props) {
  const sortedCeremonies = [...ceremonies].sort(
    (a, b) => ceremonyTimeSortKey(a.ceremony) - ceremonyTimeSortKey(b.ceremony)
  );
  const firmaAbsences = absences.filter((a) => !a.extern);
  const externAbsences = absences.filter((a) => a.extern);

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

      {absences.length > 0 && (
        <div className="plan-day-absences" title="Abwesend an diesem Tag">
          <span className="plan-day-absences-label">Abwesend</span>
          {firmaAbsences.length > 0 && (
            <p className="plan-day-absences-line">
              <span className="plan-day-absences-kind">Firma:</span>{' '}
              {firmaAbsences.map((a) => a.name).join(', ')}
            </p>
          )}
          {externAbsences.length > 0 && (
            <p className="plan-day-absences-line">
              <span className="plan-day-absences-kind">Extern:</span>{' '}
              {externAbsences.map((a) => a.name).join(', ')}
            </p>
          )}
        </div>
      )}

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
                </>
              );

              return (
                <li
                  key={`${c.docId}-${ceremony.kind}-${ceremony.datum}-${ceremony.zeit ?? ''}`}
                  className={`plan-center-ceremony is-${ceremony.kind}${
                    clickable ? ' is-clickable' : ''
                  }`}
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
                personnelLine={transferPersonnelLines[card.id]}
                onDragStart={onCardDragStart}
                onDragEnd={onCardDragEnd}
                onReset={onResetCard}
                onPersonnelClick={onTransferPersonnelClick}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}
