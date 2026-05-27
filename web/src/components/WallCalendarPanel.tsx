import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Sterbefall } from '../types';

import { useNarrowViewport } from '../hooks/useNarrowViewport';

import { useCalendarArtFilter } from '../hooks/useCalendarArtFilter';
import { useWallCalendarViewState } from '../hooks/useWallCalendarViewState';

import {

  ALL_CALENDAR_TERMIN_ARTEN,

  buildWallCalendarDays,

  buildWallCalendarEntries,

  CALENDAR_TERMIN_ART_LABELS,

  calendarColorGroupFromArts,

  countCalendarEntries,

  filterCalendarEntries,

  filterEntriesByArts,

  isCalendarFilterComplete,

  isWallCalendarDayInAnchorMonth,

  type WallCalendarDay,

  type WallCalendarEntry,

  type WallCalendarRange,

} from '../board/wallCalendar';

import { WallCalendarPeriodOverview } from './WallCalendarPeriodOverview';
import { WallCalendarTerminShare } from './WallCalendarTerminShare';



interface Props {

  sterbefaelle: Sterbefall[];

  now: Date;

}



const RANGE_OPTIONS: { id: WallCalendarRange; label: string; short: string }[] = [

  { id: 7, label: '7 Tage', short: '7' },

  { id: 14, label: '14 Tage', short: '14' },

  { id: 'month', label: 'Monat', short: 'M' },

];

const MONTH_CARD_MIN_WIDTH = 148;
const MONTH_GRID_GAP_PX = 8;
const MONTH_OVERSCAN_ROWS = 2;
const DEFAULT_MONTH_ROW_HEIGHT = 220;



export function WallCalendarPanel({ sterbefaelle, now }: Props) {

  const isNarrow = useNarrowViewport();

  const { range, setRange, search, setSearch, focusDayKey, setFocusDayKey, todayKey } =
    useWallCalendarViewState(now);

  const { activeArts, toggle, selectAll, isActive } = useCalendarArtFilter();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const scrollToFocusPending = useRef(false);
  const monthGridRef = useRef<HTMLDivElement | null>(null);
  const [monthGridMetrics, setMonthGridMetrics] = useState({
    columns: 1,
    rowHeight: DEFAULT_MONTH_ROW_HEIGHT,
    scrollTop: 0,
    viewportHeight: 0,
  });

  const selectFocusDay = useCallback(
    (dayKey: string) => {
      scrollToFocusPending.current = true;
      setFocusDayKey(dayKey);
    },
    [setFocusDayKey]
  );

  const changeRange = useCallback(
    (next: WallCalendarRange) => {
      // Beim Umschalten (z. B. auf Monat) den Fokus aktiv auf heute setzen
      // und Scroll in der Eintragsansicht erzwingen.
      scrollToFocusPending.current = true;
      setFocusDayKey(todayKey);
      setRange(next);
    },
    [setFocusDayKey, setRange, todayKey]
  );

  const allEntries = useMemo(() => buildWallCalendarEntries(sterbefaelle), [sterbefaelle]);

  const scoped = useMemo(() => {
    let list = allEntries;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((e) => e.searchText.includes(q));
    return filterEntriesByArts(list, activeArts);
  }, [allEntries, search, activeArts]);

  const filtered = useMemo(
    () => filterCalendarEntries(scoped, range, now, ''),
    [scoped, range, now]
  );

  const days = useMemo(
    () => buildWallCalendarDays(filtered, range, now),
    [filtered, range, now]
  );

  const overviewDays = useMemo(
    () =>
      range === 'month'
        ? days.filter((d) => isWallCalendarDayInAnchorMonth(d.dayKey, now))
        : days,
    [days, range, now]
  );



  const totalInRange = filtered.length;

  const monthLabel =

    range === 'month'

      ? now.toLocaleDateString('de-AT', { month: 'long', year: 'numeric' })

      : range === 14

        ? '14 Tage'

        : '7 Tage';



  const showPeriodOverview = range === 'month' || range === 7 || range === 14;

  const overviewColumns = range === 14 ? 7 : 7;

  useEffect(() => {
    // Beim Öffnen des Kalender-Tabs immer auf "heute" fokussieren.
    scrollToFocusPending.current = true;
    setFocusDayKey(todayKey);
  }, [todayKey, setFocusDayKey]);

  useEffect(() => {
    if (!scrollToFocusPending.current || !focusDayKey || activeArts.size === 0) return;
    const el = document.getElementById(`wall-cal-focus-${focusDayKey}`);
    if (!el) return;

    scrollToFocusPending.current = false;
    const t = window.setTimeout(() => {
      el.scrollIntoView({
        behavior: 'smooth',
        block: range === 'month' ? 'center' : 'nearest',
        inline: isNarrow ? 'start' : 'nearest',
      });
    }, 60);
    return () => window.clearTimeout(t);
  }, [focusDayKey, days.length, isNarrow, activeArts.size, range]);

  useEffect(() => {
    if (range !== 'month' || isNarrow) return;
    const grid = monthGridRef.current;
    if (!grid) return;

    const syncMetrics = () => {
      const width = grid.clientWidth;
      const columns = Math.max(
        1,
        Math.floor((width + MONTH_GRID_GAP_PX) / (MONTH_CARD_MIN_WIDTH + MONTH_GRID_GAP_PX))
      );
      const firstDay = grid.querySelector('.wall-cal-day--month') as HTMLElement | null;
      const rowHeight =
        (firstDay?.getBoundingClientRect().height ?? DEFAULT_MONTH_ROW_HEIGHT) + MONTH_GRID_GAP_PX;

      setMonthGridMetrics((prev) => ({
        columns,
        rowHeight: Number.isFinite(rowHeight) ? rowHeight : prev.rowHeight,
        scrollTop: grid.scrollTop,
        viewportHeight: grid.clientHeight,
      }));
    };

    const onScroll = () => {
      setMonthGridMetrics((prev) => ({ ...prev, scrollTop: grid.scrollTop }));
    };

    syncMetrics();
    const ro = new ResizeObserver(syncMetrics);
    ro.observe(grid);
    grid.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      grid.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [range, isNarrow, days.length]);

  useEffect(() => {
    if (!scrollToFocusPending.current || range !== 'month' || isNarrow || !focusDayKey) return;
    const grid = monthGridRef.current;
    if (!grid) return;
    const index = days.findIndex((d) => d.dayKey === focusDayKey);
    if (index < 0) return;
    const row = Math.floor(index / monthGridMetrics.columns);
    const targetTop =
      row * monthGridMetrics.rowHeight -
      monthGridMetrics.viewportHeight / 2 +
      monthGridMetrics.rowHeight / 2;
    if (Number.isFinite(targetTop)) {
      grid.scrollTop = Math.max(0, targetTop);
    }
  }, [focusDayKey, range, isNarrow, days, monthGridMetrics]);

  const monthVirtual = useMemo(() => {
    if (range !== 'month' || isNarrow) {
      return { visibleDays: days, topSpacerPx: 0, bottomSpacerPx: 0 };
    }
    const columns = Math.max(1, monthGridMetrics.columns);
    const rowHeight = Math.max(1, monthGridMetrics.rowHeight);
    const viewportHeight = Math.max(rowHeight, monthGridMetrics.viewportHeight);
    const totalRows = Math.max(1, Math.ceil(days.length / columns));
    const startRow = Math.max(
      0,
      Math.floor(monthGridMetrics.scrollTop / rowHeight) - MONTH_OVERSCAN_ROWS
    );
    const endRow = Math.min(
      totalRows - 1,
      Math.ceil((monthGridMetrics.scrollTop + viewportHeight) / rowHeight) + MONTH_OVERSCAN_ROWS
    );
    const startIndex = startRow * columns;
    const endIndex = Math.min(days.length, (endRow + 1) * columns);
    const topSpacerPx = startRow * rowHeight;
    const bottomSpacerPx = Math.max(0, (totalRows - endRow - 1) * rowHeight);

    return {
      visibleDays: days.slice(startIndex, endIndex),
      topSpacerPx,
      bottomSpacerPx,
    };
  }, [range, isNarrow, days, monthGridMetrics]);



  const filterAllOn = isCalendarFilterComplete(activeArts);

  const onToday = todayKey;
  const focusIsToday = focusDayKey === onToday;



  return (

    <div className={`wall-cal ${isNarrow ? 'wall-cal--narrow' : ''}`}>

      <div className="wall-cal-toolbar">

        <div className="wall-cal-toolbar-left">

          {!isNarrow && <h2 className="wall-stage-title wall-cal-title">Kalender</h2>}

          {(range === 'month' || isNarrow) && (

            <span className="wall-cal-month">{monthLabel}</span>

          )}

          <span className="wall-cal-count">

            {totalInRange} Termin{totalInRange === 1 ? '' : 'e'}

          </span>

        </div>

        <div className="wall-cal-toolbar-right">

          <label className="wall-cal-search">

            <span className="sr-only">Suche</span>

            <input

              type="search"

              className="wall-cal-search-input"

              placeholder={isNarrow ? 'Suche…' : 'Suche Name, Ort, Sterbefall-ID, Überführung …'}

              value={search}

              onChange={(e) => setSearch(e.target.value)}

              autoComplete="off"

            />

          </label>

          <div className="wall-cal-range" role="group" aria-label="Zeitraum">

            {RANGE_OPTIONS.map((opt) => (

              <button

                key={String(opt.id)}

                type="button"

                className={`wall-cal-range-btn ${range === opt.id ? 'active' : ''}`}

                onClick={() => changeRange(opt.id)}

              >

                {isNarrow ? opt.short : opt.label}

              </button>

            ))}

          </div>

        </div>

      </div>



      {isNarrow && (
        <button
          type="button"
          className="wall-cal-filters-toggle"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((o) => !o)}
        >
          Filter ({activeArts.size}/{ALL_CALENDAR_TERMIN_ARTEN.length})
          <span className="wall-cal-filters-chevron" aria-hidden>
            {filtersOpen ? '▲' : '▼'}
          </span>
        </button>
      )}

      <div
        className={`wall-cal-art-filters ${isNarrow && !filtersOpen ? 'is-collapsed' : ''}`}
        role="group"
        aria-label="Terminarten filtern"
      >
        {!filterAllOn && (
          <button type="button" className="wall-cal-art-all" onClick={selectAll}>
            Alle
          </button>
        )}
        {ALL_CALENDAR_TERMIN_ARTEN.map((art) => (
          <button
            key={art}
            type="button"
            className={`wall-cal-art-chip wall-cal-art-chip--${art} ${isActive(art) ? 'active' : ''}`}
            aria-pressed={isActive(art)}
            onClick={() => toggle(art)}
          >
            {CALENDAR_TERMIN_ART_LABELS[art]}
          </button>
        ))}
      </div>



      {activeArts.size === 0 ? (

        <p className="wall-empty wall-cal-empty">Mindestens eine Terminart auswählen</p>

      ) : totalInRange === 0 ? (

        <p className="wall-empty wall-cal-empty">

          {search.trim()

            ? 'Keine Termine zur Suche / Filter'

            : 'Keine Termine im Zeitraum'}

        </p>

      ) : isNarrow ? (

        <div className="wall-cal-mobile-body">

          {showPeriodOverview && (
            <WallCalendarPeriodRow
              days={overviewDays}
              columns={overviewColumns}
              compact
              denseMonth={range === 'month'}
              selectedDayKey={focusDayKey}
              onDaySelect={selectFocusDay}
              onToday={() => selectFocusDay(onToday)}
              todayDisabled={focusIsToday}
            />
          )}

          <WallCalendarMobileAgenda
            days={days}
            range={range}
            scrollToDayKey={focusDayKey}
          />

        </div>

      ) : (

        <div className="wall-cal-desktop-body">

          {showPeriodOverview && (
            <WallCalendarPeriodRow
              days={overviewDays}
              columns={overviewColumns}
              selectedDayKey={focusDayKey}
              onDaySelect={selectFocusDay}
              onToday={() => selectFocusDay(onToday)}
              todayDisabled={focusIsToday}
            />
          )}

          {range === 'month' ? (

            <div className="wall-cal-month-grid" ref={monthGridRef}>

              {monthVirtual.topSpacerPx > 0 && (
                <div
                  className="wall-cal-month-spacer"
                  style={{ height: `${monthVirtual.topSpacerPx}px` }}
                  aria-hidden
                />
              )}

              {monthVirtual.visibleDays.map((day) => (

                <WallCalendarDaySection
                  key={day.dayKey}
                  day={day}
                  compact
                  scrollId={day.dayKey}
                  active={focusDayKey === day.dayKey}
                />

              ))}

              {monthVirtual.bottomSpacerPx > 0 && (
                <div
                  className="wall-cal-month-spacer"
                  style={{ height: `${monthVirtual.bottomSpacerPx}px` }}
                  aria-hidden
                />
              )}

            </div>

          ) : range === 14 ? (

            <div className="wall-cal-weeks-stack">

              {[0, 1].map((weekIdx) => (

                <WallCalendarWeekStrip
                  key={weekIdx}
                  days={days.slice(weekIdx * 7, weekIdx * 7 + 7)}
                  focusDayKey={focusDayKey}
                />

              ))}

            </div>

          ) : (

            <WallCalendarWeekStrip days={days} focusDayKey={focusDayKey} />

          )}

        </div>

      )}

    </div>

  );

}



function WallCalendarWeekStrip({
  days,
  focusDayKey,
}: {
  days: WallCalendarDay[];
  focusDayKey: string | null;
}) {
  return (
    <div className="wall-cal-strip wall-cal-strip--week">
      {days.map((day) => (
        <WallCalendarDaySection
          key={day.dayKey}
          day={day}
          strip
          scrollId={day.dayKey}
          active={focusDayKey === day.dayKey}
        />
      ))}
    </div>
  );
}

function WallCalendarPeriodRow({
  days,
  columns,
  compact,
  denseMonth,
  selectedDayKey,
  onDaySelect,
  onToday,
  todayDisabled,
}: {
  days: WallCalendarDay[];
  columns: number;
  compact?: boolean;
  denseMonth?: boolean;
  selectedDayKey?: string | null;
  onDaySelect: (dayKey: string) => void;
  onToday: () => void;
  todayDisabled: boolean;
}) {
  return (
    <div className="wall-cal-period-row">
      <WallCalendarPeriodOverview
        days={days}
        columns={columns}
        compact={compact}
        denseMonth={denseMonth}
        selectedDayKey={selectedDayKey}
        onDaySelect={onDaySelect}
      />
      <button
        type="button"
        className="wall-cal-today-btn"
        onClick={onToday}
        disabled={todayDisabled}
        aria-label="Zu heute springen"
      >
        Heute
      </button>
    </div>
  );
}

function WallCalendarMobileAgenda({
  days,
  range,
  scrollToDayKey,
}: {
  days: WallCalendarDay[];
  range: WallCalendarRange;
  scrollToDayKey?: string | null;
}) {
  return (
    <div
      className={`wall-cal-mobile-strip wall-cal-mobile-strip--${range}`}
      aria-label="Termine — seitlich wischen"
    >
      {days.map((day) => (
        <section
          key={day.dayKey}
          id={`wall-cal-focus-${day.dayKey}`}
          className={`wall-cal-agenda-day ${day.isToday ? 'is-today' : ''} ${day.isWeekend ? 'is-weekend' : ''} ${day.entries.length === 0 ? 'is-empty' : ''} ${scrollToDayKey === day.dayKey ? 'is-focused' : ''}`}
        >
          <header className="wall-cal-agenda-day-head">
            <span className="wall-cal-agenda-wd">{day.weekdayShort}</span>
            <span className="wall-cal-agenda-date">
              {day.dayLabel.split(',')[1]?.trim() ?? day.dayLabel}
            </span>
            {day.isToday && <span className="wall-cal-today-pill">Heute</span>}
            {day.entries.length > 0 && (
              <span className="wall-cal-agenda-count">{day.entries.length}</span>
            )}
          </header>
          {day.entries.length === 0 ? (
            <p className="wall-cal-agenda-none">—</p>
          ) : (
            <ul className="wall-cal-agenda-list">
              {day.entries.map((e) => (
                <li key={e.id} className={`wall-cal-event ${e.grouped ? 'is-grouped' : ''}`}>
                  <WallCalendarEventCard entry={e} mobile />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}



function WallCalendarDaySection({

  day,

  compact = false,

  strip = false,

  scrollId,
  active = false,

}: {

  day: WallCalendarDay;

  compact?: boolean;

  strip?: boolean;

  scrollId?: string;
  active?: boolean;

}) {

  const mod = strip ? 'strip' : compact ? 'month' : '';

  return (

    <section

      id={scrollId ? `wall-cal-focus-${scrollId}` : undefined}
      className={`wall-cal-day wall-cal-day--${mod} ${day.isToday ? 'is-today' : ''} ${active ? 'is-active' : ''} ${day.isWeekend ? 'is-weekend' : ''} ${day.entries.length === 0 && compact ? 'is-empty' : ''}`}

    >

      <header className="wall-cal-day-head">

        <span className="wall-cal-day-wd">{day.weekdayShort}</span>

        <span className="wall-cal-day-num">

          {compact

            ? (day.dayLabel.split(',')[1]?.trim() ?? day.dayLabel)

            : day.dayLabel}

        </span>

        {day.isToday && <span className="wall-cal-today-pill">Heute</span>}

        {strip && day.entries.length > 0 && (

          <span className="wall-cal-day-badge">{day.entries.length}</span>

        )}

      </header>

      <ul className={`wall-cal-day-list ${strip ? 'scroll' : ''}`}>

        {day.entries.length === 0 ? (

          <li className="wall-cal-day-none">—</li>

        ) : (

          day.entries.map((e) => (

            <li key={e.id} className={`wall-cal-event ${e.grouped ? 'is-grouped' : ''}`}>

              <WallCalendarEventCard entry={e} compact={compact} />

            </li>

          ))

        )}

      </ul>

    </section>

  );

}



function WallCalendarEventCard({

  entry,

  compact = false,

  mobile = false,

}: {

  entry: WallCalendarEntry;

  compact?: boolean;

  mobile?: boolean;

}) {

  const colorClass = `wall-cal-card--color-${calendarColorGroupFromArts(entry.arts)}`;



  if (mobile) {

    return (

      <article

        className={`wall-cal-card wall-cal-card--mobile ${colorClass} ${entry.grouped ? 'is-grouped' : ''}`}

      >

        <time className="wall-cal-time">{entry.timeLabel}</time>

        <div className="wall-cal-mobile-body">

          <span className="wall-cal-name">{entry.name}</span>

          <span className="wall-cal-mobile-line">

            <span className="wall-cal-mobile-types">{entry.badges.join(' · ')}</span>

            {(entry.subtitle || entry.title) && (

              <span className="wall-cal-meta">{entry.subtitle || entry.title}</span>

            )}

          </span>

          <WallCalendarTerminShare entry={entry} compact />

        </div>

      </article>

    );

  }



  return (

    <article className={`wall-cal-card ${compact ? 'wall-cal-card--compact' : ''} ${colorClass}`}>

      <div className="wall-cal-card-top">

        <time className="wall-cal-time">{entry.timeLabel}</time>

        <div className="wall-cal-badges">

          {entry.badges.map((b) => (

            <span key={b} className="wall-cal-badge">

              {b}

            </span>

          ))}

        </div>

      </div>

      <span className="wall-cal-name">{entry.name}</span>

      <span className="wall-cal-meta">{entry.subtitle || entry.title}</span>

      <WallCalendarTerminShare entry={entry} compact={compact} />

      {!compact && entry.grouped && (

        <span className="wall-cal-group-hint">Trauerblock · {entry.sterbefallId}</span>

      )}

    </article>

  );

}



export function wallCalendarTabCount(sterbefaelle: Sterbefall[], now: Date): number {

  const entries = buildWallCalendarEntries(sterbefaelle);

  return countCalendarEntries(filterCalendarEntries(entries, 7, now, ''));

}


