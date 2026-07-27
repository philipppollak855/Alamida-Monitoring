import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlanRichtung, ScheduleDraft } from '../../planning/types';
import type { EigenerKuehlraumConfig } from '../../types/dispositionSettings';
import { RouteFlow } from '../../ui/RouteFlow';

type Props = {
  draft: ScheduleDraft | null;
  kuehlraeume: EigenerKuehlraumConfig[];
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (draft: ScheduleDraft) => void;
};

const RICHTUNG_LABEL: Record<PlanRichtung, string> = {
  ankunft: 'Ankunft in Kühlraum',
  abgang: 'Abgang / Retour / Krematorium',
  umzug: 'Umzug in anderen Kühlraum',
};

export function PlanningScheduleDialog({
  draft,
  kuehlraeume,
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
  const [richtung, setRichtung] = useState<PlanRichtung>('ankunft');
  const [kuehlraumId, setKuehlraumId] = useState('');
  const [fromKuehlraumId, setFromKuehlraumId] = useState('');

  useEffect(() => {
    if (!draft) return;
    setDayKey(draft.dayKey);
    setZeit(draft.zeit || '10:00');
    setVonOrt(draft.vonOrt);
    setNachOrt(draft.nachOrt);
    setRichtung(draft.richtung);
    setKuehlraumId(draft.kuehlraumId);
    setFromKuehlraumId(draft.fromKuehlraumId ?? draft.kuehlraumId ?? '');
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

  const targetKr = kuehlraeume.find((k) => k.id === kuehlraumId);
  const fromKr = kuehlraeume.find((k) => k.id === fromKuehlraumId);
  const canSubmit =
    !!dayKey &&
    !!vonOrt.trim() &&
    !!nachOrt.trim() &&
    !pending &&
    (richtung === 'abgang' ? !!fromKuehlraumId : !!kuehlraumId) &&
    (richtung !== 'umzug' || (!!fromKuehlraumId && fromKuehlraumId !== kuehlraumId));

  function applyRichtung(next: PlanRichtung) {
    setRichtung(next);
    if (next === 'ankunft' && targetKr) {
      setNachOrt(targetKr.alamidaName?.trim() || targetKr.label);
    }
    if (next === 'umzug' && targetKr) {
      setNachOrt(targetKr.alamidaName?.trim() || targetKr.label);
      if (fromKr) setVonOrt(fromKr.alamidaName?.trim() || fromKr.label);
    }
    if (next === 'abgang' && fromKr) {
      setVonOrt(fromKr.alamidaName?.trim() || fromKr.label);
    }
  }

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
            <p className="plan-schedule-kicker">
              {draft.createNewLeg ? 'Weitere Überführung' : 'Überführung planen'}
            </p>
            <h2 id={titleId}>{draft.name}</h2>
            <p className="plan-schedule-sub">{RICHTUNG_LABEL[richtung]}</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
            Schließen
          </button>
        </header>

        <div className="plan-schedule-route" aria-hidden>
          <RouteFlow von={vonOrt || '—'} nach={nachOrt || '—'} />
        </div>

        <div className="plan-schedule-fields">
          <label className="plan-schedule-span">
            <span>Richtung</span>
            <select
              value={richtung}
              onChange={(e) => applyRichtung(e.target.value as PlanRichtung)}
              disabled={pending}
            >
              <option value="ankunft">{RICHTUNG_LABEL.ankunft}</option>
              <option value="abgang">{RICHTUNG_LABEL.abgang}</option>
              <option value="umzug">{RICHTUNG_LABEL.umzug}</option>
            </select>
          </label>

          {(richtung === 'abgang' || richtung === 'umzug') && (
            <label>
              <span>Von Kühlraum</span>
              <select
                value={fromKuehlraumId}
                onChange={(e) => {
                  const id = e.target.value;
                  setFromKuehlraumId(id);
                  const kr = kuehlraeume.find((k) => k.id === id);
                  if (kr) setVonOrt(kr.alamidaName?.trim() || kr.label);
                }}
                disabled={pending}
              >
                <option value="">— wählen —</option>
                {kuehlraeume.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {(richtung === 'ankunft' || richtung === 'umzug') && (
            <label>
              <span>Nach Kühlraum</span>
              <select
                value={kuehlraumId}
                onChange={(e) => {
                  const id = e.target.value;
                  setKuehlraumId(id);
                  const kr = kuehlraeume.find((k) => k.id === id);
                  if (kr) setNachOrt(kr.alamidaName?.trim() || kr.label);
                }}
                disabled={pending}
              >
                <option value="">— wählen —</option>
                {kuehlraeume.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
          )}

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
              placeholder={richtung === 'abgang' ? 'Krematorium, Retour, Friedhof…' : undefined}
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
            onClick={() => {
              const kr =
                richtung === 'abgang'
                  ? kuehlraeume.find((k) => k.id === fromKuehlraumId)
                  : kuehlraeume.find((k) => k.id === kuehlraumId);
              onConfirm({
                ...draft,
                dayKey,
                zeit,
                vonOrt: vonOrt.trim(),
                nachOrt: nachOrt.trim(),
                richtung,
                kuehlraumId: richtung === 'abgang' ? fromKuehlraumId : kuehlraumId,
                kuehlraumLabel: kr?.label || draft.kuehlraumLabel,
                fromKuehlraumId:
                  richtung === 'ankunft' ? null : fromKuehlraumId || draft.fromKuehlraumId || null,
              });
            }}
          >
            {pending
              ? 'Speichert…'
              : draft.createNewLeg
                ? 'Weitere Überführung anlegen'
                : 'Überführung speichern'}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
