import { useMemo, useState } from 'react';

import type { Sterbefall } from '../types';

import { useNarrowViewport } from '../hooks/useNarrowViewport';

import { useCalendarArtFilter } from '../hooks/useCalendarArtFilter';

import {

  ALL_CALENDAR_TERMIN_ARTEN,

  buildWallCalendarDays,

  buildWallCalendarEntries,

  CALENDAR_TERMIN_ART_LABELS,

  countCalendarEntries,

  filterCalendarEntries,

  filterEntriesByArts,

  isWallCalendarDayInAnchorMonth,

  type WallCalendarDay,

  type WallCalendarEntry,

  type WallCalendarRange,

} from '../board/wallCalendar';

import { WallCalendarPeriodOverview } from './WallCalendarPeriodOverview';



interface Props {

  sterbefaelle: Sterbefall[];

  now: Date;

}



const RANGE_OPTIONS: { id: WallCalendarRange; label: string; short: string }[] = [

  { id: 7, label: '7 Tage', short: '7' },

  { id: 14, label: '14 Tage', short: '14' },

  { id: 'month', label: 'Monat', short: 'M' },

];



export function WallCalendarPanel({ sterbefaelle, now }: Props) {

  const isNarrow = useNarrowViewport();

  const [range, setRange] = useState<WallCalendarRange>(7);

  const [search, setSearch] = useState('');

  const { activeArts, toggle, selectAll, isActive } = useCalendarArtFilter();
  const [filtersOpen, setFiltersOpen] = useState(false);

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



  const filterAllOn = activeArts.size >= ALL_CALENDAR_TERMIN_ARTEN.length;



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

                onClick={() => setRange(opt.id)}

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

            <WallCalendarPeriodOverview
              days={overviewDays}
              columns={overviewColumns}
              compact
              denseMonth={range === 'month'}
            />

          )}

          <WallCalendarMobileAgenda days={days} range={range} />

        </div>

      ) : (

        <div className="wall-cal-desktop-body">

          {showPeriodOverview && (

            <WallCalendarPeriodOverview days={overviewDays} columns={overviewColumns} />

          )}

          {range === 'month' ? (

            <div className="wall-cal-month-grid">

              {days.map((day) => (

                <WallCalendarDaySection key={day.dayKey} day={day} compact />

              ))}

            </div>

          ) : (

            <div

              className="wall-cal-strip"

              style={{ '--cal-cols': days.length } as React.CSSProperties}

            >

              {days.map((day) => (

                <WallCalendarDaySection key={day.dayKey} day={day} strip />

              ))}

            </div>

          )}

        </div>

      )}

    </div>

  );

}



function WallCalendarMobileAgenda({
  days,
  range,
}: {
  days: WallCalendarDay[];
  range: WallCalendarRange;
}) {
  return (
    <div
      className={`wall-cal-mobile-strip wall-cal-mobile-strip--${range}`}
      aria-label="Termine — seitlich wischen"
    >
      {days.map((day) => (
        <section
          key={day.dayKey}
          className={`wall-cal-agenda-day ${day.isToday ? 'is-today' : ''} ${day.isWeekend ? 'is-weekend' : ''} ${day.entries.length === 0 ? 'is-empty' : ''}`}
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

}: {

  day: WallCalendarDay;

  compact?: boolean;

  strip?: boolean;

}) {

  const mod = strip ? 'strip' : compact ? 'month' : '';

  return (

    <section

      className={`wall-cal-day wall-cal-day--${mod} ${day.isToday ? 'is-today' : ''} ${day.isWeekend ? 'is-weekend' : ''} ${day.entries.length === 0 && compact ? 'is-empty' : ''}`}

    >

      <header className="wall-cal-day-head">

        <span className="wall-cal-day-wd">{day.weekdayShort}</span>

        <span className="wall-cal-day-num">

          {compact

            ? (day.dayLabel.split(',')[1]?.trim() ?? day.dayLabel)

            : day.dayLabel}

        </span>

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

  const artClass = entry.arts[0] ? `wall-cal-card--art-${entry.arts[0]}` : '';



  if (mobile) {

    return (

      <article

        className={`wall-cal-card wall-cal-card--mobile ${artClass} ${entry.grouped ? 'is-grouped' : ''}`}

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

        </div>

      </article>

    );

  }



  return (

    <article className={`wall-cal-card ${compact ? 'wall-cal-card--compact' : ''} ${artClass}`}>

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


