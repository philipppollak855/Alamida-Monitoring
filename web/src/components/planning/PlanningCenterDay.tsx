import type { ReactNode } from 'react';
import type { CeremonyInfo, KuehlraumDayCapacity, PlanningCard } from '../../planning/types';
import type { PersonnelBooking } from '../../types/personnelBooking';
import type { ZusatzTermin } from '../../types/zusatzTermin';
import { ZUSATZ_TERMIN_ART_LABELS } from '../../types/zusatzTermin';
import {
  isAttachableCeremonyKind,
  isCardAttachedToAnyCeremony,
  isKremationPlanningCard,
  partitionKremationGroups,
  pickCeremonyHostForCard,
} from '../../planning/transferPlanning';
import { PlanningTransferCard } from './PlanningTransferCard';
import { PlanningKremationGroupCard } from './PlanningKremationGroupCard';
import { PlanningCapacityMeters } from './PlanningCapacityMeters';
import { WallCalBestattungsBadge } from '../WallCalBestattungsBadge';

type DayCeremony = {
  docId: string;
  name: string;
  ceremony: CeremonyInfo;
  booking?: PersonnelBooking | null;
  personnelLine?: string | null;
  needsLine?: string | null;
  needsPersonnel?: boolean;
  personnelIncomplete?: boolean;
};

export type DayZusatzItem = {
  termin: ZusatzTermin;
  personnelLine?: string | null;
  personnelIncomplete?: boolean;
};

type Props = {
  dayKey: string;
  title: string;
  isToday?: boolean;
  isFocus?: boolean;
  transfers: PlanningCard[];
  ceremonies: DayCeremony[];
  zusatzItems?: DayZusatzItem[];
  capacities: KuehlraumDayCapacity[];
  isDropTarget: boolean;
  ceremonyDropKey?: string | null;
  kremationDropKey?: string | null;
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
  onKremationDragOver?: (card: PlanningCard) => void;
  onKremationDragLeave?: () => void;
  onDropOnKremation?: (card: PlanningCard) => void;
  onOpenPersonnel?: (card: PlanningCard) => void;
  personnelByCardId?: Record<string, string | null>;
  onAddZusatz?: () => void;
  onZusatzPersonnel?: (termin: ZusatzTermin) => void;
  onZusatzEdit?: (termin: ZusatzTermin) => void;
  /** Mobile: Tippen statt Drag. */
  tapSelect?: boolean;
  /** z. B. Bereitschafts-Chips unter dem Tageskopf. */
  headerExtra?: ReactNode;
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

function ceremonyHostKey(c: DayCeremony): string {
  return `${c.docId}|${c.ceremony.kind}|${c.ceremony.dayKey ?? ''}`;
}

export function PlanningCenterDay({
  dayKey,
  title,
  isToday,
  isFocus,
  transfers,
  ceremonies,
  zusatzItems = [],
  capacities,
  isDropTarget,
  ceremonyDropKey,
  kremationDropKey,
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
  onKremationDragOver,
  onKremationDragLeave,
  onDropOnKremation,
  onOpenPersonnel,
  personnelByCardId,
  onAddZusatz,
  onZusatzPersonnel,
  onZusatzEdit,
  tapSelect,
  headerExtra,
}: Props) {
  const sortedCeremonies = [...ceremonies].sort(
    (a, b) => ceremonyTimeSortKey(a.ceremony) - ceremonyTimeSortKey(b.ceremony)
  );

  const attachedByHost = new Map<string, PlanningCard[]>();
  const looseTransfers: PlanningCard[] = [];

  for (const card of transfers) {
    if (!isCardAttachedToAnyCeremony(card)) {
      looseTransfers.push(card);
      continue;
    }
    const host = pickCeremonyHostForCard(card, sortedCeremonies);
    if (!host) {
      looseTransfers.push(card);
      continue;
    }
    const key = `${host.docId}|${host.ceremony.kind}|${host.ceremony.dayKey ?? ''}`;
    const list = attachedByHost.get(key) ?? [];
    list.push(card);
    attachedByHost.set(key, list);
  }

  const { groups: kremationGroups, singles: looseSinglesRaw } =
    partitionKremationGroups(looseTransfers);

  const groupedMemberIds = new Set(
    kremationGroups.flatMap((g) => g.members.map((m) => m.id))
  );
  const groupedDocIds = new Set(
    kremationGroups.flatMap((g) => g.members.map((m) => m.docId))
  );

  // Mitglieder einer Kremationsfahrt nie zusätzlich als Einzelkarte
  const looseSingles = looseSinglesRaw.filter((c) => !groupedMemberIds.has(c.id));

  // Kremations-Termine der zusammengefassten Fälle ausblenden — nur die Gruppenkarte bleibt
  const visibleCeremonies = sortedCeremonies.filter(
    (c) => !(c.ceremony.kind === 'kremation' && groupedDocIds.has(c.docId))
  );

  const looseCount =
    kremationGroups.reduce((n, g) => n + g.members.length, 0) + looseSingles.length;

  return (
    <section
      className={`plan-center-day${isToday ? ' is-today' : ''}${
        isFocus ? ' is-focus-day' : ''
      }${isDropTarget ? ' is-drop-target' : ''}`}
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
        <div className="plan-center-day-head-actions">
          {onAddZusatz && (
            <button
              type="button"
              className="plan-day-add-termin"
              title="Benutzerdefinierten Termin anlegen"
              onClick={(e) => {
                e.stopPropagation();
                onAddZusatz();
              }}
            >
              + Termin
            </button>
          )}
          <span className="plan-column-count">{looseCount}</span>
        </div>
      </header>

      {headerExtra}

      {capacities.length > 0 && <PlanningCapacityMeters capacities={capacities} />}

      <div className="plan-center-day-body">
        {zusatzItems.length > 0 && (
          <ul className="plan-center-ceremonies plan-center-zusatz" aria-label="Zusatztermine">
            {zusatzItems.map(({ termin, personnelLine, personnelIncomplete }) => (
              <li key={termin.id}>
                <div
                  className={`plan-center-ceremony is-zusatz is-${termin.art}${
                    onZusatzPersonnel ? ' is-clickable' : ''
                  }`}
                  role={onZusatzPersonnel ? 'button' : undefined}
                  tabIndex={onZusatzPersonnel ? 0 : undefined}
                  title={
                    onZusatzPersonnel
                      ? 'Klicken: Personal einbuchen'
                      : termin.note || termin.title
                  }
                  onClick={
                    onZusatzPersonnel
                      ? () => onZusatzPersonnel(termin)
                      : undefined
                  }
                  onKeyDown={
                    onZusatzPersonnel
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onZusatzPersonnel(termin);
                          }
                        }
                      : undefined
                  }
                >
                  <div className="plan-center-ceremony-top">
                    <span className={`plan-ceremony-kind is-zusatz is-${termin.art}`}>
                      {ZUSATZ_TERMIN_ART_LABELS[termin.art]}
                    </span>
                    {termin.zeit && (
                      <span className="plan-center-ceremony-when">{termin.zeit}</span>
                    )}
                    {onZusatzEdit && (
                      <button
                        type="button"
                        className="plan-zusatz-edit"
                        title="Termin bearbeiten"
                        onClick={(e) => {
                          e.stopPropagation();
                          onZusatzEdit(termin);
                        }}
                      >
                        Bearbeiten
                      </button>
                    )}
                  </div>
                  <strong className="plan-center-ceremony-name" title={termin.title}>
                    {termin.title}
                  </strong>
                  <span className="plan-center-ceremony-ort" title={termin.name}>
                    {termin.name}
                  </span>
                  {termin.note && (
                    <span className="plan-center-ceremony-needs" title={termin.note}>
                      {termin.note}
                    </span>
                  )}
                  {personnelLine && !personnelIncomplete ? (
                    <span className="plan-center-ceremony-personnel" title={personnelLine}>
                      {personnelLine}
                    </span>
                  ) : personnelLine ? (
                    <span
                      className="plan-center-ceremony-personnel is-open"
                      title={personnelLine}
                    >
                      {personnelLine.includes('Personal offen')
                        ? personnelLine
                        : `${personnelLine} · Personal offen`}
                    </span>
                  ) : (
                    <span
                      className="plan-center-ceremony-personnel is-optional"
                      title="Personal optional — klicken zum Einbuchen"
                    >
                      Personal optional
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {visibleCeremonies.length > 0 && (
          <ul className="plan-center-ceremonies" aria-label="Termine an diesem Tag">
            {visibleCeremonies.map((c) => {
              const { ceremony } = c;
              const when =
                ceremony.zeit ||
                (!isToday && ceremony.relativeLabel ? ceremony.relativeLabel : null) ||
                ceremony.datum ||
                null;
              const clickable =
                Boolean(onCeremonyClick) && c.needsPersonnel !== false;
              const acceptDrop =
                Boolean(onDropOnCeremony) && isAttachableCeremonyKind(ceremony.kind);
              const dropKey = ceremonyDropId(c);
              const hostKey = ceremonyHostKey(c);
              const attached = attachedByHost.get(hostKey) ?? [];
              const isMerged = attached.length > 0;
              const isCeremonyDrop = acceptDrop && ceremonyDropKey === dropKey;
              const content = (
                <>
                  <div className="plan-center-ceremony-top">
                    <span className={`plan-ceremony-kind is-${ceremony.kind}`}>
                      {ceremonyKindLabel(ceremony.kind)}
                    </span>
                    {isMerged && (
                      <span className="plan-ceremony-merged-badge" title="Überführung zugehörig">
                        + Überf.
                      </span>
                    )}
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
                  {c.personnelLine && !c.personnelIncomplete ? (
                    <span className="plan-center-ceremony-personnel" title={c.personnelLine}>
                      {c.personnelLine}
                    </span>
                  ) : c.needsPersonnel === false ? (
                    <span className="plan-center-ceremony-personnel" title="Kein Personal nötig">
                      Kein Personal
                    </span>
                  ) : (
                    <span
                      className="plan-center-ceremony-personnel is-open"
                      title={c.personnelLine ?? 'Personal noch nicht vollständig'}
                    >
                      {c.personnelLine?.includes('Personal offen')
                        ? c.personnelLine
                        : c.personnelLine
                          ? `${c.personnelLine} · Personal offen`
                          : 'Personal offen'}
                    </span>
                  )}
                  {acceptDrop && !isMerged && (
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
                  }${isMerged ? ' is-merged' : ''}`}
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

                  {attached.map((card) => (
                    <div
                      key={card.id}
                      className={`plan-center-ceremony-leg${
                        draggingId === card.id ? ' is-dragging' : ''
                      }`}
                      draggable={!card.erledigt}
                      title={`${card.vonOrt} → ${card.nachOrt}`}
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', card.id);
                        onCardDragStart(card);
                      }}
                      onDragEnd={onCardDragEnd}
                    >
                      <span className="plan-card-grip" aria-hidden title="Herausziehen trennt vom Termin">
                        ⠿
                      </span>
                      <span className="plan-center-ceremony-leg-label">Überf.</span>
                      <span className="plan-center-ceremony-leg-route">
                        <span className="plan-center-ceremony-leg-from">{card.vonOrt}</span>
                        <span className="plan-center-ceremony-leg-arrow" aria-hidden>
                          →
                        </span>
                        <span className="plan-center-ceremony-leg-to">{card.nachOrt}</span>
                      </span>
                      {card.plannedZeit && (
                        <span className="plan-center-ceremony-leg-time">{card.plannedZeit}</span>
                      )}
                      {(card.hasManualPlan || card.plannedDayKey != null) && (
                        <button
                          type="button"
                          className={`plan-reset-btn${card.canUndoUmplanung ? ' is-undo' : ''}`}
                          title={
                            card.canUndoUmplanung
                              ? 'Umplanung rückgängig'
                              : 'Zugehörigkeit lösen / zurücksetzen'
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            onResetCard(card);
                          }}
                        >
                          ↺
                        </button>
                      )}
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
        )}

        <div className="plan-column-cards">
          {looseCount === 0 ? (
            visibleCeremonies.length === 0 ? (
              <p className="plan-column-empty">Überführung hierher ziehen (X → Y)</p>
            ) : null
          ) : (
            <>
              {kremationGroups.map((group) => (
                <PlanningKremationGroupCard
                  key={group.groupId}
                  group={group}
                  draggingId={draggingId}
                  isDropTarget={kremationDropKey === group.host.id}
                  onCardDragStart={onCardDragStart}
                  onCardDragEnd={onCardDragEnd}
                  onDragOverGroup={() => onKremationDragOver?.(group.host)}
                  onDragLeaveGroup={onKremationDragLeave}
                  onDropOnGroup={
                    onDropOnKremation ? () => onDropOnKremation(group.host) : undefined
                  }
                  onResetCard={onResetCard}
                />
              ))}
              {looseSingles.map((card) => (
                <PlanningTransferCard
                  key={card.id}
                  card={card}
                  dragging={draggingId === card.id}
                  personnelLine={personnelByCardId?.[card.id]}
                  tapSelect={tapSelect}
                  isDropTarget={
                    Boolean(onDropOnKremation) &&
                    isKremationPlanningCard(card) &&
                    kremationDropKey === card.id
                  }
                  onDragStart={onCardDragStart}
                  onDragEnd={onCardDragEnd}
                  onReset={onResetCard}
                  onOpenPersonnel={onOpenPersonnel}
                  onDragOverCard={
                    onDropOnKremation && isKremationPlanningCard(card)
                      ? () => onKremationDragOver?.(card)
                      : undefined
                  }
                  onDragLeaveCard={onKremationDragLeave}
                  onDropOnCard={
                    onDropOnKremation && isKremationPlanningCard(card)
                      ? () => onDropOnKremation(card)
                      : undefined
                  }
                />
              ))}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
