import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  addDays,
  dayKeyFromDate,
  formatDayLabelDe,
} from '../board/dateUtils';
import type { DispositionPerson } from '../types/dispositionSettings';
import type { PersonnelAbsence } from '../types/personnelBooking';

type Props = {
  open: boolean;
  dayKeys: string[];
  personnelPool: DispositionPerson[];
  absences: Record<string, PersonnelAbsence>;
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (absence: PersonnelAbsence) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
};

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const PERSON_COLORS = [
  '#3d7a8c',
  '#b85a68',
  '#5a8a62',
  '#8a6b3d',
  '#6a7a9a',
  '#8a5a8a',
  '#3d8a7a',
  '#9a6b4a',
];

function newId(): string {
  return `abs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function dateFromDayKey(dayKey: string): Date {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function colorForPerson(personId: string): string {
  let h = 0;
  for (let i = 0; i < personId.length; i++) h = (h * 31 + personId.charCodeAt(i)) >>> 0;
  return PERSON_COLORS[h % PERSON_COLORS.length]!;
}

function formatRangeLabel(fromDayKey: string, toDayKey: string): string {
  if (fromDayKey === toDayKey) return formatDayLabelDe(fromDayKey);
  return `${formatDayLabelDe(fromDayKey)} – ${formatDayLabelDe(toDayKey)}`;
}

function formatAbsenceTimeRange(
  fromTime?: string,
  toTime?: string
): string | null {
  if (!fromTime?.trim() && !toTime?.trim()) return null;
  const from = fromTime?.trim() || '00:00';
  const to = toTime?.trim() || '23:59';
  return `${from}–${to}`;
}

function absenceCoversDay(a: PersonnelAbsence, dayKey: string): boolean {
  return a.fromDayKey <= dayKey && dayKey <= a.toDayKey;
}

function absenceOverlapsRange(
  a: PersonnelAbsence,
  fromDayKey: string,
  toDayKey: string
): boolean {
  return a.fromDayKey <= toDayKey && a.toDayKey >= fromDayKey;
}

function orderedRange(a: string, b: string): { from: string; to: string } {
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

export function PersonnelAbsenceDialog({
  open,
  dayKeys,
  personnelPool,
  absences,
  pending,
  error,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const titleId = useId();
  const closeOnBackdrop = useRef(false);
  const people = useMemo(
    () =>
      [...personnelPool.filter((p) => p.active !== false)].sort((a, b) =>
        a.name.localeCompare(b.name, 'de')
      ),
    [personnelPool]
  );
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const [personId, setPersonId] = useState('');
  const [fromDayKey, setFromDayKey] = useState(dayKeys[0] ?? dayKeyFromDate(new Date()));
  const [toDayKey, setToDayKey] = useState(
    dayKeys[dayKeys.length - 1] ?? dayKeys[0] ?? dayKeyFromDate(new Date())
  );
  const [fromTime, setFromTime] = useState('');
  const [toTime, setToTime] = useState('');
  const [note, setNote] = useState('');
  const [filterPersonId, setFilterPersonId] = useState<string>('all');
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  /** Erster Klick der Spannenauswahl — zweiter Klick setzt Bis. */
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);
  /** Kalenderfilter aktiv (nach Auswahl). */
  const [calFilterActive, setCalFilterActive] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const start = dayKeys[0] ?? dayKeyFromDate(new Date());
    const end = dayKeys[dayKeys.length - 1] ?? start;
    setFromDayKey(start);
    setToDayKey(end);
    setFromTime('');
    setToTime('');
    setPersonId((prev) => prev || people[0]?.id || '');
    setNote('');
    setFilterPersonId('all');
    setRangeAnchor(null);
    setCalFilterActive(false);
    setDeletingId(null);
    setMonthCursor(startOfMonth(dateFromDayKey(start)));
  }, [open, dayKeys, people]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, pending]);

  const allAbsences = useMemo(() => {
    return Object.values(absences).sort((a, b) => {
      if (a.fromDayKey !== b.fromDayKey) return b.fromDayKey.localeCompare(a.fromDayKey);
      const an = byId.get(a.personId)?.name ?? a.personId;
      const bn = byId.get(b.personId)?.name ?? b.personId;
      return an.localeCompare(bn, 'de');
    });
  }, [absences, byId]);

  const filteredAbsences = useMemo(() => {
    let list = allAbsences;
    if (filterPersonId !== 'all') {
      list = list.filter((a) => a.personId === filterPersonId);
    }
    if (calFilterActive) {
      list = list.filter((a) => absenceOverlapsRange(a, fromDayKey, toDayKey));
    }
    return list;
  }, [allAbsences, filterPersonId, calFilterActive, fromDayKey, toDayKey]);

  const absencesByPerson = useMemo(() => {
    const map = new Map<string, PersonnelAbsence[]>();
    for (const a of filteredAbsences) {
      const list = map.get(a.personId) ?? [];
      list.push(a);
      map.set(a.personId, list);
    }
    return [...map.entries()].sort(([aId], [bId]) => {
      const an = byId.get(aId)?.name ?? aId;
      const bn = byId.get(bId)?.name ?? bId;
      return an.localeCompare(bn, 'de');
    });
  }, [filteredAbsences, byId]);

  const monthCells = useMemo(() => {
    const first = startOfMonth(monthCursor);
    const startOffset = (first.getDay() + 6) % 7; // Monday-first
    const gridStart = addDays(first, -startOffset);
    const cells: Array<{
      dayKey: string;
      inMonth: boolean;
      isToday: boolean;
      inRange: boolean;
      isRangeEdge: boolean;
      absences: PersonnelAbsence[];
    }> = [];
    const todayKey = dayKeyFromDate(new Date());
    const preview =
      rangeAnchor != null
        ? orderedRange(rangeAnchor, rangeAnchor)
        : calFilterActive
          ? orderedRange(fromDayKey, toDayKey)
          : null;
    for (let i = 0; i < 42; i++) {
      const d = addDays(gridStart, i);
      const dayKey = dayKeyFromDate(d);
      const dayAbs = allAbsences.filter(
        (a) =>
          absenceCoversDay(a, dayKey) &&
          (filterPersonId === 'all' || a.personId === filterPersonId)
      );
      const inRange = Boolean(
        preview && dayKey >= preview.from && dayKey <= preview.to
      );
      const isRangeEdge = Boolean(
        preview && (dayKey === preview.from || dayKey === preview.to)
      );
      cells.push({
        dayKey,
        inMonth: d.getMonth() === monthCursor.getMonth(),
        isToday: dayKey === todayKey,
        inRange,
        isRangeEdge,
        absences: dayAbs,
      });
    }
    return cells;
  }, [
    monthCursor,
    allAbsences,
    filterPersonId,
    rangeAnchor,
    calFilterActive,
    fromDayKey,
    toDayKey,
  ]);

  const monthLabel = monthCursor.toLocaleDateString('de-AT', {
    month: 'long',
    year: 'numeric',
  });

  function clearCalSelection() {
    setRangeAnchor(null);
    setCalFilterActive(false);
  }

  function handleDayClick(dayKey: string) {
    if (rangeAnchor == null) {
      // 1. Klick: Spanne starten
      setRangeAnchor(dayKey);
      setFromDayKey(dayKey);
      setToDayKey(dayKey);
      setCalFilterActive(true);
      return;
    }
    if (rangeAnchor === dayKey) {
      // Gleicher Tag nochmal → Einzel-Tag behalten, Auswahl abschließen
      setRangeAnchor(null);
      setFromDayKey(dayKey);
      setToDayKey(dayKey);
      setCalFilterActive(true);
      return;
    }
    // 2. Klick: Spanne festlegen
    const { from, to } = orderedRange(rangeAnchor, dayKey);
    setFromDayKey(from);
    setToDayKey(to);
    setRangeAnchor(null);
    setCalFilterActive(true);
  }

  async function handleDelete(id: string) {
    if (pending || deletingId) return;
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  }

  if (!open) return null;

  const rangeHint =
    rangeAnchor != null
      ? `Von ${formatDayLabelDe(rangeAnchor)} — jetzt Enddatum tippen`
      : calFilterActive
        ? `Auswahl: ${formatRangeLabel(fromDayKey, toDayKey)}`
        : 'Tag tippen, danach zweiten Tag für die Spanne';

  return createPortal(
    <div
      className="personnel-booking-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        closeOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={() => {
        if (closeOnBackdrop.current && !pending) onClose();
        closeOnBackdrop.current = false;
      }}
    >
      <div
        className="personnel-absence-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="personnel-booking-head">
          <div>
            <p className="personnel-booking-kicker">Personal</p>
            <h2 id={titleId}>Abwesenheiten</h2>
            <p className="personnel-booking-sub">
              Alle Einträge im Überblick — Kalender: zwei Klicks setzen Von–Bis.
              Uhrzeiten optional für stundenweise Abwesenheit.
            </p>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={pending}>
            Schließen
          </button>
        </header>

        <div className="personnel-absence-layout">
          <section className="personnel-absence-cal" aria-label="Abwesenheitskalender">
            <div className="personnel-absence-cal-nav">
              <button
                type="button"
                className="btn-ghost btn-small"
                disabled={pending}
                onClick={() =>
                  setMonthCursor(
                    (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1)
                  )
                }
              >
                ←
              </button>
              <strong>{monthLabel}</strong>
              <button
                type="button"
                className="btn-ghost btn-small"
                disabled={pending}
                onClick={() =>
                  setMonthCursor(
                    (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1)
                  )
                }
              >
                →
              </button>
            </div>
            <div className="personnel-absence-cal-weekdays">
              {WEEKDAYS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="personnel-absence-cal-grid">
              {monthCells.map((cell) => {
                const title =
                  cell.absences.length === 0
                    ? formatDayLabelDe(cell.dayKey)
                    : `${formatDayLabelDe(cell.dayKey)}: ${cell.absences
                        .map((a) => byId.get(a.personId)?.name ?? a.personId)
                        .join(', ')}`;
                return (
                  <button
                    key={cell.dayKey}
                    type="button"
                    title={title}
                    className={[
                      'personnel-absence-cal-day',
                      cell.inMonth ? '' : ' is-outside',
                      cell.isToday ? ' is-today' : '',
                      cell.inRange ? ' is-in-range' : '',
                      cell.isRangeEdge ? ' is-selected' : '',
                      rangeAnchor === cell.dayKey ? ' is-anchor' : '',
                      cell.absences.length > 0 ? ' has-absence' : '',
                    ]
                      .filter(Boolean)
                      .join('')}
                    disabled={pending}
                    onClick={() => handleDayClick(cell.dayKey)}
                  >
                    <span className="personnel-absence-cal-num">
                      {Number(cell.dayKey.slice(-2))}
                    </span>
                    {cell.absences.length > 0 && (
                      <span className="personnel-absence-cal-dots" aria-hidden>
                        {cell.absences.slice(0, 4).map((a) => (
                          <i
                            key={a.id}
                            style={{ background: colorForPerson(a.personId) }}
                          />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="personnel-absence-cal-hint">
              {rangeHint}{' '}
              {(calFilterActive || rangeAnchor) && (
                <button
                  type="button"
                  className="btn-ghost btn-small"
                  onClick={clearCalSelection}
                >
                  zurücksetzen
                </button>
              )}
            </p>
          </section>

          <div className="personnel-absence-side">
            <div className="personnel-absence-form">
              <label className="personnel-booking-field">
                <span>Person</span>
                <select
                  value={personId}
                  onChange={(e) => setPersonId(e.target.value)}
                  disabled={pending || people.length === 0}
                >
                  {people.length === 0 && <option value="">Kein Pool</option>}
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.extern ? ' (extern)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="personnel-booking-field">
                <span>Von</span>
                <input
                  type="date"
                  value={fromDayKey}
                  onChange={(e) => {
                    setFromDayKey(e.target.value);
                    setRangeAnchor(null);
                    setCalFilterActive(true);
                  }}
                  disabled={pending}
                />
              </label>
              <label className="personnel-booking-field">
                <span>Bis</span>
                <input
                  type="date"
                  value={toDayKey}
                  onChange={(e) => {
                    setToDayKey(e.target.value);
                    setRangeAnchor(null);
                    setCalFilterActive(true);
                  }}
                  disabled={pending}
                />
              </label>
              <label className="personnel-booking-field">
                <span>Von (Uhrzeit)</span>
                <input
                  type="time"
                  value={fromTime}
                  onChange={(e) => setFromTime(e.target.value)}
                  disabled={pending}
                />
              </label>
              <label className="personnel-booking-field">
                <span>Bis (Uhrzeit)</span>
                <input
                  type="time"
                  value={toTime}
                  onChange={(e) => setToTime(e.target.value)}
                  disabled={pending}
                />
              </label>
              <label className="personnel-booking-field personnel-absence-note">
                <span>Notiz</span>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={pending}
                  placeholder="optional"
                />
              </label>
              <button
                type="button"
                className="btn-primary"
                disabled={
                  pending ||
                  !personId ||
                  !fromDayKey ||
                  !toDayKey ||
                  toDayKey < fromDayKey ||
                  (fromDayKey === toDayKey &&
                    Boolean(fromTime && toTime && toTime < fromTime))
                }
                onClick={() =>
                  void onSave({
                    id: newId(),
                    personId,
                    fromDayKey,
                    toDayKey,
                    fromTime: fromTime.trim() || undefined,
                    toTime: toTime.trim() || undefined,
                    note: note.trim() || undefined,
                    updatedAtMs: Date.now(),
                  })
                }
              >
                Eintragen
              </button>
            </div>

            <label className="personnel-booking-field personnel-absence-filter">
              <span>Liste filtern</span>
              <select
                value={filterPersonId}
                onChange={(e) => setFilterPersonId(e.target.value)}
                disabled={pending}
              >
                <option value="all">Alle Personen ({allAbsences.length})</option>
                {people.map((p) => {
                  const count = allAbsences.filter((a) => a.personId === p.id).length;
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {count > 0 ? ` (${count})` : ''}
                    </option>
                  );
                })}
              </select>
            </label>

            {error && (
              <p className="board-inline-error" role="alert">
                {error}
              </p>
            )}

            <div className="personnel-absence-groups">
              {absencesByPerson.length === 0 ? (
                <p className="personnel-booking-empty">
                  {calFilterActive || filterPersonId !== 'all'
                    ? 'Keine Abwesenheiten für diesen Filter.'
                    : 'Noch keine Abwesenheiten eingetragen.'}
                </p>
              ) : (
                absencesByPerson.map(([pid, list]) => {
                  const person = byId.get(pid);
                  return (
                    <section key={pid} className="personnel-absence-group">
                      <header className="personnel-absence-group-head">
                        <i
                          className="personnel-absence-swatch"
                          style={{ background: colorForPerson(pid) }}
                          aria-hidden
                        />
                        <strong>{person?.name ?? pid}</strong>
                        <span>
                          {list.length} Einträg{list.length === 1 ? '' : 'e'}
                          {person?.extern ? ' · extern' : ''}
                        </span>
                      </header>
                      <ul className="personnel-absence-list">
                        {list.map((a) => {
                          const hours = formatAbsenceTimeRange(a.fromTime, a.toTime);
                          return (
                            <li key={a.id}>
                              <div>
                                <strong>
                                  {formatRangeLabel(a.fromDayKey, a.toDayKey)}
                                  {hours ? ` · ${hours}` : ''}
                                </strong>
                                <span>
                                  {a.fromDayKey}
                                  {a.fromDayKey !== a.toDayKey ? ` – ${a.toDayKey}` : ''}
                                  {hours ? ` · ${hours}` : ' · ganztägig'}
                                  {a.note ? ` · ${a.note}` : ''}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="btn-ghost btn-small"
                                disabled={pending || deletingId === a.id}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  void handleDelete(a.id);
                                }}
                              >
                                {deletingId === a.id ? 'Löscht…' : 'Löschen'}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
