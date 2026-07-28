import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  addDays,
  dayKeyFromDate,
  formatDayLabelDe,
} from '../board/dateUtils';
import {
  isBereitschaftRelevantDay,
  personAbbrev,
  relevantDayKeysInRange,
  standbyStaffingWarning,
} from '../board/bereitschaftRules';
import { holidayLabel } from '../board/publicHolidays';
import type { DispositionPerson, HolidayRegion } from '../types/dispositionSettings';
import type {
  PersonnelAbsence,
  PersonnelStandby,
  PersonnelStandbyExclusion,
} from '../types/personnelBooking';

type Props = {
  open: boolean;
  dayKeys: string[];
  /** Vorausgewählter Tag (z. B. aus Kalender-Klick). */
  initialDayKey?: string | null;
  personnelPool: DispositionPerson[];
  standbys: Record<string, PersonnelStandby>;
  absences?: Record<string, PersonnelAbsence>;
  holidayRegion: HolidayRegion;
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (standby: PersonnelStandby) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onHolidayRegionChange: (region: HolidayRegion) => void | Promise<void>;
};

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function dateFromDayKey(dayKey: string): Date {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function formatRangeLabel(fromDayKey: string, toDayKey: string): string {
  if (fromDayKey === toDayKey) return formatDayLabelDe(fromDayKey);
  return `${formatDayLabelDe(fromDayKey)} – ${formatDayLabelDe(toDayKey)}`;
}

function orderedRange(a: string, b: string): { from: string; to: string } {
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

function standbyOverlapsRange(
  s: PersonnelStandby,
  fromDayKey: string,
  toDayKey: string
): boolean {
  return s.fromDayKey <= toDayKey && s.toDayKey >= fromDayKey;
}

export function PersonnelStandbyDialog({
  open,
  dayKeys,
  initialDayKey,
  personnelPool,
  standbys,
  holidayRegion,
  pending,
  error,
  onClose,
  onSave,
  onDelete,
  onHolidayRegionChange,
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

  const defaultDay = initialDayKey || dayKeys[0] || dayKeyFromDate(new Date());
  const [fromDayKey, setFromDayKey] = useState(defaultDay);
  const [toDayKey, setToDayKey] = useState(defaultDay);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [exclusions, setExclusions] = useState<PersonnelStandbyExclusion[]>([]);
  const [exPersonId, setExPersonId] = useState('');
  const [exDayKey, setExDayKey] = useState(defaultDay);
  const [exFromTime, setExFromTime] = useState('12:00');
  const [exToTime, setExToTime] = useState('14:00');
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(dateFromDayKey(defaultDay)));
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);
  const [calFilterActive, setCalFilterActive] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [regionLocal, setRegionLocal] = useState<HolidayRegion>(holidayRegion);

  useEffect(() => {
    if (!open) return;
    const start = initialDayKey || dayKeys[0] || dayKeyFromDate(new Date());
    setFromDayKey(start);
    setToDayKey(start);
    setSelectedIds([]);
    setNote('');
    setExclusions([]);
    setExPersonId(people[0]?.id || '');
    setExDayKey(start);
    setExFromTime('12:00');
    setExToTime('14:00');
    setRangeAnchor(null);
    setCalFilterActive(Boolean(initialDayKey));
    setDeletingId(null);
    setEditingId(null);
    setMonthCursor(startOfMonth(dateFromDayKey(start)));
    setRegionLocal(holidayRegion);
  }, [open, dayKeys, people, initialDayKey, holidayRegion]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, pending]);

  const relevantInSelection = useMemo(
    () => relevantDayKeysInRange(fromDayKey, toDayKey, regionLocal),
    [fromDayKey, toDayKey, regionLocal]
  );

  const staffingWarn = standbyStaffingWarning(selectedIds.length);

  const allStandbys = useMemo(() => {
    return Object.values(standbys).sort((a, b) => {
      if (a.fromDayKey !== b.fromDayKey) return b.fromDayKey.localeCompare(a.fromDayKey);
      return a.id.localeCompare(b.id);
    });
  }, [standbys]);

  const filteredStandbys = useMemo(() => {
    if (!calFilterActive) return allStandbys;
    return allStandbys.filter((s) => standbyOverlapsRange(s, fromDayKey, toDayKey));
  }, [allStandbys, calFilterActive, fromDayKey, toDayKey]);

  const monthCells = useMemo(() => {
    const first = startOfMonth(monthCursor);
    const startOffset = (first.getDay() + 6) % 7;
    const gridStart = addDays(first, -startOffset);
    const cells: Array<{
      dayKey: string;
      inMonth: boolean;
      isToday: boolean;
      inRange: boolean;
      isRangeEdge: boolean;
      relevant: boolean;
      holiday: string | null;
      count: number;
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
      const relevant = isBereitschaftRelevantDay(dayKey, regionLocal);
      const covering = Object.values(standbys).filter(
        (s) => s.fromDayKey <= dayKey && dayKey <= s.toDayKey
      );
      const personSet = new Set<string>();
      for (const s of covering) for (const id of s.personIds) personSet.add(id);
      cells.push({
        dayKey,
        inMonth: d.getMonth() === monthCursor.getMonth(),
        isToday: dayKey === todayKey,
        inRange: Boolean(preview && dayKey >= preview.from && dayKey <= preview.to),
        isRangeEdge: Boolean(
          preview && (dayKey === preview.from || dayKey === preview.to)
        ),
        relevant,
        holiday: holidayLabel(dayKey, regionLocal),
        count: personSet.size,
      });
    }
    return cells;
  }, [
    monthCursor,
    standbys,
    regionLocal,
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

  function resetForm(day = fromDayKey) {
    setEditingId(null);
    setSelectedIds([]);
    setNote('');
    setExclusions([]);
    setExPersonId(people[0]?.id || '');
    setExDayKey(day);
    setExFromTime('12:00');
    setExToTime('14:00');
  }

  function startEdit(s: PersonnelStandby) {
    setEditingId(s.id);
    setFromDayKey(s.fromDayKey);
    setToDayKey(s.toDayKey);
    setSelectedIds([...s.personIds]);
    setNote(s.note ?? '');
    setExclusions(s.exclusions ? s.exclusions.map((e) => ({ ...e })) : []);
    setExPersonId(s.personIds[0] || people[0]?.id || '');
    setExDayKey(s.fromDayKey);
    setRangeAnchor(null);
    setCalFilterActive(true);
    setMonthCursor(startOfMonth(dateFromDayKey(s.fromDayKey)));
  }

  function handleDayClick(dayKey: string) {
    if (rangeAnchor == null) {
      setRangeAnchor(dayKey);
      setFromDayKey(dayKey);
      setToDayKey(dayKey);
      setExDayKey(dayKey);
      setCalFilterActive(true);
      return;
    }
    if (rangeAnchor === dayKey) {
      setRangeAnchor(null);
      setFromDayKey(dayKey);
      setToDayKey(dayKey);
      setExDayKey(dayKey);
      setCalFilterActive(true);
      return;
    }
    const { from, to } = orderedRange(rangeAnchor, dayKey);
    setFromDayKey(from);
    setToDayKey(to);
    setExDayKey(from);
    setRangeAnchor(null);
    setCalFilterActive(true);
  }

  function togglePerson(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function addExclusion() {
    if (!exPersonId || !exDayKey || !exFromTime || !exToTime) return;
    if (exDayKey < fromDayKey || exDayKey > toDayKey) return;
    if (!selectedIds.includes(exPersonId)) return;
    if (exFromTime >= exToTime && fromDayKey === toDayKey) {
      /* same day: require from < to — still allow for UX with message via disabled */
    }
    setExclusions((prev) => [
      ...prev,
      {
        id: newId('ex'),
        personId: exPersonId,
        dayKey: exDayKey,
        fromTime: exFromTime,
        toTime: exToTime,
      },
    ]);
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

  async function handleRegionChange(next: HolidayRegion) {
    setRegionLocal(next);
    await onHolidayRegionChange(next);
  }

  if (!open) return null;

  const rangeHint =
    rangeAnchor != null
      ? `Von ${formatDayLabelDe(rangeAnchor)} — jetzt Enddatum tippen`
      : calFilterActive
        ? `Auswahl: ${formatRangeLabel(fromDayKey, toDayKey)} (${relevantInSelection.length} Bereitschaftstage)`
        : 'Tag tippen, danach zweiten Tag für die Spanne (Fr/Sa/So/Feiertag)';

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
        className="personnel-absence-dialog personnel-standby-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="personnel-booking-head">
          <div>
            <p className="personnel-booking-kicker">Personal</p>
            <h2 id={titleId}>Bereitschaft</h2>
            <p className="personnel-booking-sub">
              Fr/Sa/So und Feiertage — mind. 2 Personen empfohlen. Zeitausschlüsse optional.
            </p>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={pending}>
            Schließen
          </button>
        </header>

        <div className="personnel-absence-layout">
          <section className="personnel-absence-cal" aria-label="Bereitschaftskalender">
            <div className="personnel-standby-region">
              <label className="personnel-booking-field">
                <span>Feiertage</span>
                <select
                  value={regionLocal}
                  disabled={pending}
                  onChange={(e) =>
                    void handleRegionChange(e.target.value === 'DE' ? 'DE' : 'AT')
                  }
                >
                  <option value="AT">Österreich</option>
                  <option value="DE">Deutschland</option>
                </select>
              </label>
            </div>
            <div className="personnel-absence-cal-nav">
              <button
                type="button"
                className="btn-ghost btn-small"
                disabled={pending}
                onClick={() =>
                  setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
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
                  setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
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
                const title = [
                  formatDayLabelDe(cell.dayKey),
                  cell.holiday,
                  cell.relevant ? 'Bereitschaftstag' : null,
                  cell.count > 0 ? `${cell.count} Person(en)` : null,
                ]
                  .filter(Boolean)
                  .join(' · ');
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
                      cell.relevant ? ' is-bereitschaft-day' : '',
                      cell.count > 0 ? ' has-absence' : '',
                    ]
                      .filter(Boolean)
                      .join('')}
                    disabled={pending}
                    onClick={() => handleDayClick(cell.dayKey)}
                  >
                    <span className="personnel-absence-cal-num">
                      {Number(cell.dayKey.slice(-2))}
                    </span>
                    {cell.count > 0 && (
                      <span className="personnel-absence-cal-dots" aria-hidden>
                        {Array.from({ length: Math.min(cell.count, 6) }, (_, i) => (
                          <i
                            key={i}
                            style={{
                              background: cell.count < 2 ? '#b85a68' : '#3d7a8c',
                            }}
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
            <div className="personnel-standby-form">
              <label className="personnel-booking-field">
                <span>Von</span>
                <input
                  type="date"
                  value={fromDayKey}
                  onChange={(e) => {
                    setFromDayKey(e.target.value);
                    setExDayKey(e.target.value);
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

              <fieldset className="personnel-standby-people" disabled={pending}>
                <legend>Personal (mind. 2)</legend>
                {people.length === 0 ? (
                  <p className="personnel-booking-empty">Kein Personalpool.</p>
                ) : (
                  <ul>
                    {people.map((p) => (
                      <li key={p.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(p.id)}
                            onChange={() => togglePerson(p.id)}
                          />
                          <span>
                            {p.name}{' '}
                            <em className="personnel-standby-abbrev">
                              ({personAbbrev(p.name)})
                            </em>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </fieldset>

              {staffingWarn && (
                <p className="personnel-standby-warn" role="status">
                  {staffingWarn} Speichern trotzdem möglich.
                </p>
              )}

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

              <div className="personnel-standby-excl">
                <p className="personnel-standby-excl-title">Zeitausschluss</p>
                <div className="personnel-standby-excl-row">
                  <select
                    value={exPersonId}
                    onChange={(e) => setExPersonId(e.target.value)}
                    disabled={pending || selectedIds.length === 0}
                  >
                    {selectedIds.length === 0 && <option value="">Zuerst Personen wählen</option>}
                    {selectedIds.map((id) => (
                      <option key={id} value={id}>
                        {byId.get(id)?.name ?? id}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={exDayKey}
                    min={fromDayKey}
                    max={toDayKey}
                    onChange={(e) => setExDayKey(e.target.value)}
                    disabled={pending}
                  />
                  <input
                    type="time"
                    value={exFromTime}
                    onChange={(e) => setExFromTime(e.target.value)}
                    disabled={pending}
                  />
                  <input
                    type="time"
                    value={exToTime}
                    onChange={(e) => setExToTime(e.target.value)}
                    disabled={pending}
                  />
                  <button
                    type="button"
                    className="btn-ghost btn-small"
                    disabled={
                      pending ||
                      !exPersonId ||
                      !selectedIds.includes(exPersonId) ||
                      !exFromTime ||
                      !exToTime ||
                      exDayKey < fromDayKey ||
                      exDayKey > toDayKey
                    }
                    onClick={addExclusion}
                  >
                    + Außer
                  </button>
                </div>
                {exclusions.length > 0 && (
                  <ul className="personnel-standby-excl-list">
                    {exclusions.map((ex) => (
                      <li key={ex.id}>
                        <span>
                          {byId.get(ex.personId)?.name ?? ex.personId}: {ex.dayKey} außer{' '}
                          {ex.fromTime}–{ex.toTime}
                        </span>
                        <button
                          type="button"
                          className="btn-ghost btn-small"
                          disabled={pending}
                          onClick={() =>
                            setExclusions((prev) => prev.filter((e) => e.id !== ex.id))
                          }
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="personnel-standby-form-actions">
                {editingId && (
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={pending}
                    onClick={() => resetForm(fromDayKey)}
                  >
                    Abbrechen
                  </button>
                )}
                <button
                  type="button"
                  className="btn-primary"
                  disabled={
                    pending ||
                    selectedIds.length === 0 ||
                    !fromDayKey ||
                    !toDayKey ||
                    toDayKey < fromDayKey
                  }
                  onClick={() => {
                    const id = editingId ?? newId('stb');
                    void onSave({
                      id,
                      fromDayKey,
                      toDayKey,
                      personIds: selectedIds,
                      exclusions: exclusions.length > 0 ? exclusions : undefined,
                      note: note.trim() || undefined,
                      updatedAtMs: Date.now(),
                    });
                    resetForm(fromDayKey);
                  }}
                >
                  {editingId ? 'Änderungen speichern' : 'Eintragen'}
                </button>
              </div>
            </div>

            {error && (
              <p className="board-inline-error" role="alert">
                {error}
              </p>
            )}

            <div className="personnel-absence-groups">
              {filteredStandbys.length === 0 ? (
                <p className="personnel-booking-empty">
                  Noch keine Bereitschaften eingetragen.
                </p>
              ) : (
                <ul className="personnel-absence-list">
                  {filteredStandbys.map((s) => {
                    const names = s.personIds
                      .map((id) => byId.get(id)?.name ?? id)
                      .join(', ');
                    const abbrevs = s.personIds
                      .map((id) => personAbbrev(byId.get(id)?.name ?? id))
                      .join(' ');
                    const warn = standbyStaffingWarning(s.personIds.length);
                    const isEditing = editingId === s.id;
                    return (
                      <li key={s.id} className={isEditing ? 'is-editing' : ''}>
                        <div>
                          <strong>
                            {formatRangeLabel(s.fromDayKey, s.toDayKey)}
                            {warn ? ' · !' : ''}
                            {isEditing ? ' · wird bearbeitet' : ''}
                          </strong>
                          <span>
                            {abbrevs} · {names}
                            {s.exclusions?.length
                              ? ` · ${s.exclusions.length} Ausschluss`
                              : ''}
                            {s.note ? ` · ${s.note}` : ''}
                          </span>
                        </div>
                        <div className="personnel-standby-list-actions">
                          <button
                            type="button"
                            className="btn-ghost btn-small"
                            disabled={pending || deletingId === s.id}
                            onClick={() => startEdit(s)}
                          >
                            Bearbeiten
                          </button>
                          <button
                            type="button"
                            className="btn-ghost btn-small"
                            disabled={pending || deletingId === s.id}
                            onClick={() => {
                              if (editingId === s.id) resetForm(fromDayKey);
                              void handleDelete(s.id);
                            }}
                          >
                            {deletingId === s.id ? 'Löscht…' : 'Löschen'}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
