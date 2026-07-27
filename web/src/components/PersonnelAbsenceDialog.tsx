import { useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
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

function newId(): string {
  return `abs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
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
  const people = useMemo(
    () => personnelPool.filter((p) => p.active !== false),
    [personnelPool]
  );
  const [personId, setPersonId] = useState('');
  const [fromDayKey, setFromDayKey] = useState(dayKeys[0] ?? '');
  const [toDayKey, setToDayKey] = useState(dayKeys[dayKeys.length - 1] ?? dayKeys[0] ?? '');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setFromDayKey(dayKeys[0] ?? '');
    setToDayKey(dayKeys[dayKeys.length - 1] ?? dayKeys[0] ?? '');
    setPersonId((prev) => prev || people[0]?.id || '');
    setNote('');
  }, [open, dayKeys, people]);

  const visibleAbsences = useMemo(() => {
    const rangeStart = dayKeys[0];
    const rangeEnd = dayKeys[dayKeys.length - 1];
    if (!rangeStart || !rangeEnd) return Object.values(absences);
    return Object.values(absences).filter(
      (a) => a.toDayKey >= rangeStart && a.fromDayKey <= rangeEnd
    );
  }, [absences, dayKeys]);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);

  if (!open) return null;

  return createPortal(
    <div
      className="personnel-booking-backdrop"
      role="presentation"
      onClick={() => {
        if (!pending) onClose();
      }}
    >
      <div
        className="personnel-absence-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="personnel-booking-head">
          <div>
            <p className="personnel-booking-kicker">Personal</p>
            <h2 id={titleId}>Abwesenheiten</h2>
            <p className="personnel-booking-sub">
              Abwesende Personen sind im Pool ausgegraut und nicht einbuchbar.
            </p>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={pending}>
            Schließen
          </button>
        </header>

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
                </option>
              ))}
            </select>
          </label>
          <label className="personnel-booking-field">
            <span>Von</span>
            <input
              type="date"
              value={fromDayKey}
              onChange={(e) => setFromDayKey(e.target.value)}
              disabled={pending}
            />
          </label>
          <label className="personnel-booking-field">
            <span>Bis</span>
            <input
              type="date"
              value={toDayKey}
              onChange={(e) => setToDayKey(e.target.value)}
              disabled={pending}
            />
          </label>
          <label className="personnel-booking-field">
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
              pending || !personId || !fromDayKey || !toDayKey || toDayKey < fromDayKey
            }
            onClick={() =>
              void onSave({
                id: newId(),
                personId,
                fromDayKey,
                toDayKey,
                note: note.trim() || undefined,
                updatedAtMs: Date.now(),
              })
            }
          >
            Eintragen
          </button>
        </div>

        {error && (
          <p className="board-inline-error" role="alert">
            {error}
          </p>
        )}

        <ul className="personnel-absence-list">
          {visibleAbsences.length === 0 ? (
            <li className="personnel-booking-empty">Keine Abwesenheiten in diesem Zeitraum.</li>
          ) : (
            visibleAbsences.map((a) => (
              <li key={a.id}>
                <div>
                  <strong>{byId.get(a.personId) ?? a.personId}</strong>
                  <span>
                    {a.fromDayKey === a.toDayKey
                      ? a.fromDayKey
                      : `${a.fromDayKey} – ${a.toDayKey}`}
                    {a.note ? ` · ${a.note}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-ghost btn-small"
                  disabled={pending}
                  onClick={() => void onDelete(a.id)}
                >
                  Löschen
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>,
    document.body
  );
}
