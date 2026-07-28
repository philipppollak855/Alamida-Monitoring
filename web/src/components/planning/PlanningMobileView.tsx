import { useMemo, useState, type ReactNode } from 'react';
import { formatDayLabelDe } from '../../board/dateUtils';
import type {
  CeremonyInfo,
  KuehlraumDayCapacity,
  KuehlraumOccupant,
  KuehlraumRailState,
  LocationGroup,
  PlanningCard,
  SterbeortPoolItem,
} from '../../planning/types';
import type { ZusatzTermin } from '../../types/zusatzTermin';
import { PlanningCenterDay, type DayZusatzItem } from './PlanningCenterDay';
import { PlanningDayStrip } from './PlanningDayStrip';
import { PlanningKuehlraumRail } from './PlanningKuehlraumRail';
import { PlanningLocationRail } from './PlanningLocationRail';

export type MobilePlanTab = 'orte' | 'tag' | 'kuehlraum';

type DayCeremony = {
  docId: string;
  name: string;
  ceremony: CeremonyInfo;
  personnelLine?: string | null;
  needsLine?: string | null;
  needsPersonnel?: boolean;
  personnelIncomplete?: boolean;
};

type Props = {
  dayKeys: string[];
  focusDayKey: string;
  todayKey: string;
  calendarDay: string;
  locationGroups: LocationGroup[];
  krRails: KuehlraumRailState[];
  dayCards: PlanningCard[];
  dayCeremonies: DayCeremony[];
  dayZusatz: DayZusatzItem[];
  dayCaps: KuehlraumDayCapacity[];
  countsByDay: Record<string, number>;
  draggingId: string | null;
  selectionLabel: string | null;
  dropTarget: string | null;
  personnelByCardId?: Record<string, string | null>;
  onFocusDay: (dayKey: string) => void;
  onSelectSource: (item: SterbeortPoolItem) => void;
  onSelectCard: (card: PlanningCard) => void;
  onClearSelection: () => void;
  onDropOnDay: (dayKey: string) => void;
  onDropOnAbholort: () => void;
  onDropOnKuehlraum: (id: string) => void;
  onDropOnCeremony: (c: DayCeremony) => void;
  onDropOnKremation: (card: PlanningCard) => void;
  onDropOnFahrt: (card: PlanningCard) => void;
  onResetCard: (card: PlanningCard) => void;
  onCeremonyClick: (c: DayCeremony) => void;
  onOpenPersonnel: (card: PlanningCard) => void;
  onZusatzPersonnel: (termin: ZusatzTermin) => void;
  onZusatzEdit: (termin: ZusatzTermin) => void;
  onOccupantSelect: (kr: KuehlraumRailState, occ: KuehlraumOccupant) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onGoToday: () => void;
  dayHeaderExtra?: ReactNode;
};

const TAB_LABELS: Record<MobilePlanTab, string> = {
  orte: 'Orte',
  tag: 'Tag',
  kuehlraum: 'Kühlraum',
};

/**
 * Smartphone-Planung: Tages-Strip, Tabs, Tippen statt Drag.
 * Hochformat = ein Panel; Querformat = Tag + Nebenpanel (CSS).
 */
export function PlanningMobileView({
  dayKeys,
  focusDayKey,
  todayKey,
  calendarDay,
  locationGroups,
  krRails,
  dayCards,
  dayCeremonies,
  dayZusatz,
  dayCaps,
  countsByDay,
  draggingId,
  selectionLabel,
  dropTarget,
  personnelByCardId,
  onFocusDay,
  onSelectSource,
  onSelectCard,
  onClearSelection,
  onDropOnDay,
  onDropOnAbholort,
  onDropOnKuehlraum,
  onDropOnCeremony,
  onDropOnKremation,
  onDropOnFahrt,
  onResetCard,
  onCeremonyClick,
  onOpenPersonnel,
  onZusatzPersonnel,
  onZusatzEdit,
  onOccupantSelect,
  onPrevWeek,
  onNextWeek,
  onGoToday,
  dayHeaderExtra,
}: Props) {
  const [tab, setTab] = useState<MobilePlanTab>('tag');
  const selectionActive = Boolean(draggingId);

  const hint = useMemo(() => {
    if (!selectionLabel) return null;
    return `${selectionLabel} — Ziel tippen oder abbrechen`;
  }, [selectionLabel]);

  const dayTitle = formatDayLabelDe(focusDayKey);

  return (
    <div className="plan-mobile" aria-label="Mobile Planung">
      <div className="plan-mobile-week-row">
        <button type="button" className="plan-mobile-week-btn" onClick={onPrevWeek} aria-label="Vorherige Woche">
          ←
        </button>
        <button type="button" className="plan-mobile-week-btn" onClick={onGoToday}>
          Heute
        </button>
        <button type="button" className="plan-mobile-week-btn" onClick={onNextWeek} aria-label="Nächste Woche">
          →
        </button>
      </div>

      <PlanningDayStrip
        dayKeys={dayKeys}
        focusDayKey={focusDayKey}
        todayKey={todayKey}
        countsByDay={countsByDay}
        selectionActive={selectionActive}
        onSelectDay={onFocusDay}
        onDropOnDay={onDropOnDay}
      />

      {hint && (
        <div className="plan-mobile-selection" role="status">
          <p>{hint}</p>
          <div className="plan-mobile-selection-actions">
            <button
              type="button"
              className="btn-primary plan-mobile-assign-btn"
              onClick={() => onDropOnDay(focusDayKey)}
            >
              Auf diesen Tag
            </button>
            <button type="button" className="btn-ghost" onClick={onClearSelection}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      <div className="plan-mobile-tabs" role="tablist" aria-label="Bereiche">
        {(Object.keys(TAB_LABELS) as MobilePlanTab[]).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`plan-mobile-tab${tab === id ? ' is-active' : ''}`}
            onClick={() => setTab(id)}
          >
            {TAB_LABELS[id]}
            {id === 'orte' && (
              <em>{locationGroups.reduce((n, g) => n + g.items.length, 0)}</em>
            )}
            {id === 'tag' && (
              <em>{dayCards.length + dayCeremonies.length + dayZusatz.length}</em>
            )}
            {id === 'kuehlraum' && (
              <em>{krRails.reduce((n, r) => n + r.occupiedNow, 0)}</em>
            )}
          </button>
        ))}
      </div>

      <div className={`plan-mobile-body is-tab-${tab}`}>
        <div
          className={`plan-mobile-panel plan-mobile-panel--tag${
            tab === 'tag' ? ' is-visible' : ''
          }`}
        >
          {selectionActive && (
            <button
              type="button"
              className="plan-mobile-drop-zone"
              onClick={() => onDropOnDay(focusDayKey)}
            >
              Hier einplanen · {dayTitle}
            </button>
          )}
          <PlanningCenterDay
            dayKey={focusDayKey}
            title={dayTitle}
            isToday={focusDayKey === calendarDay}
            isFocus
            transfers={dayCards}
            ceremonies={dayCeremonies}
            zusatzItems={dayZusatz}
            capacities={dayCaps}
            isDropTarget={dropTarget === `day:${focusDayKey}` || selectionActive}
            draggingId={draggingId}
            onDragOver={() => undefined}
            onDragLeave={() => undefined}
            onDrop={() => onDropOnDay(focusDayKey)}
            onCardDragStart={onSelectCard}
            onCardDragEnd={onClearSelection}
            onResetCard={onResetCard}
            onCeremonyClick={(c) => {
              if (selectionActive) onDropOnCeremony(c);
              else onCeremonyClick(c);
            }}
            onDropOnCeremony={onDropOnCeremony}
            onDropOnKremation={onDropOnKremation}
            onDropOnFahrt={onDropOnFahrt}
            onOpenPersonnel={onOpenPersonnel}
            personnelByCardId={personnelByCardId}
            onZusatzPersonnel={onZusatzPersonnel}
            onZusatzEdit={onZusatzEdit}
            tapSelect
            headerExtra={dayHeaderExtra}
          />
        </div>

        <div
          className={`plan-mobile-panel plan-mobile-panel--orte${
            tab === 'orte' ? ' is-visible' : ''
          }`}
        >
          {selectionActive && (
            <button
              type="button"
              className="plan-mobile-drop-zone is-return"
              onClick={onDropOnAbholort}
            >
              Zurück zum Abholort
            </button>
          )}
          <p className="plan-mobile-panel-hint">
            Fall tippen → dann Tag oder Kühlraum wählen
          </p>
          <PlanningLocationRail
            groups={locationGroups}
            draggingId={draggingId}
            isDropTarget={dropTarget === 'abholort'}
            onDragStart={onSelectSource}
            onDragEnd={onClearSelection}
            onDrop={selectionActive ? onDropOnAbholort : undefined}
            tapSelect
          />
        </div>

        <div
          className={`plan-mobile-panel plan-mobile-panel--kr${
            tab === 'kuehlraum' ? ' is-visible' : ''
          }`}
        >
          <p className="plan-mobile-panel-hint">
            Belegung tippen für KR→KR · bei Auswahl Kühlraum tippen
          </p>
          <PlanningKuehlraumRail
            rails={krRails}
            dropTargetId={
              dropTarget?.startsWith('kr:') ? dropTarget.slice(3) : null
            }
            draggingId={draggingId}
            onDragOver={() => undefined}
            onDragLeave={() => undefined}
            onDrop={onDropOnKuehlraum}
            onOccupantDragStart={onOccupantSelect}
            onOccupantDragEnd={onClearSelection}
            tapSelect
            expandAll
          />
        </div>
      </div>
    </div>
  );
}
