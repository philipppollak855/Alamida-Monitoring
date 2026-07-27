import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ScheduleDraft } from '../../planning/types';
import { RouteFlow } from '../../ui/RouteFlow';

type Props = {
  draft: ScheduleDraft | null;
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (draft: ScheduleDraft) => void;
};

export function PlanningScheduleDialog({
  draft,
  pending,
  error,
  onClose,
  onConfirm,
}: Props) {
  const titleId = useId();
  const [dayKey, setDayKey] = useState('');
  const [zeit, setZeit] = useState('10:00');
  const [vonOrt, setVonOrt] = useState('');
  const [nachOrt, setNachOrt] = useState('');

  useEffect(() => {
    if (!draft) return;
    setDayKey(draft.dayKey);
    setZeit(draft.zeit || '10:00');
    setVonOrt(draft.vonOrt);
    setNachOrt(draft.nachOrt);
  }, [draft]);

  useEffect(() => {
    if (!draft) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft, onClose, pending]);

  if (!draft) return null;

  const canSubmit = !!dayKey && !!vonOrt.trim() && !!nachOrt.trim() && !pending;

  return createPortal(
    <div
      className="plan-schedule-backdrop"
      role="presentation"
      onClick={() => {
        if (!pending) onClose();
      }}
    >
      <div
        className="plan-schedule-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="plan-schedule-head">
          <div>
            <p className="plan-schedule-kicker">Überführung planen</p>
            <h2 id={titleId}>{draft.name}</h2>
            <p className="plan-schedule-sub">Ziel: {draft.kuehlraumLabel}</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
            Schließen
          </button>
        </header>

        <div className="plan-schedule-route" aria-hidden>
          <RouteFlow von={vonOrt || '—'} nach={nachOrt || '—'} />
        </div>

        <div className="plan-schedule-fields">
          <label>
            <span>Von</span>
            <input
              type="text"
              value={vonOrt}
              onChange={(e) => setVonOrt(e.target.value)}
              disabled={pending}
            />
          </label>
          <label>
            <span>Nach</span>
            <input
              type="text"
              value={nachOrt}
              onChange={(e) => setNachOrt(e.target.value)}
              disabled={pending}
            />
          </label>
          <label>
            <span>Datum</span>
            <input
              type="date"
              value={dayKey}
              onChange={(e) => setDayKey(e.target.value)}
              disabled={pending}
              required
            />
          </label>
          <label>
            <span>Uhrzeit</span>
            <input
              type="time"
              value={zeit}
              onChange={(e) => setZeit(e.target.value)}
              disabled={pending}
              required
            />
          </label>
        </div>

        {error && (
          <p className="board-inline-error" role="alert">
            {error}
          </p>
        )}

        <footer className="plan-schedule-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canSubmit}
            onClick={() =>
              onConfirm({
                ...draft,
                dayKey,
                zeit,
                vonOrt: vonOrt.trim(),
                nachOrt: nachOrt.trim(),
              })
            }
          >
            {pending ? 'Speichert…' : 'Überführung anlegen'}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
