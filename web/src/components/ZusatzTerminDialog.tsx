import { useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Sterbefall } from '../types';
import {
  ZUSATZ_TERMIN_ART_LABELS,
  ZUSATZ_TERMIN_PRESETS,
  type ZusatzTermin,
  type ZusatzTerminArt,
} from '../types/zusatzTermin';
import { dayKeyFromDate } from '../board/dateUtils';

type FallOption = {
  docId: string;
  sterbefallId: string;
  name: string;
};

type Props = {
  open: boolean;
  /** Vorgewählter Tag (yyyy-MM-dd) */
  initialDayKey?: string;
  existing?: ZusatzTermin | null;
  sterbefaelle: Sterbefall[];
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (termin: ZusatzTermin) => void;
  onDelete?: () => void;
};

function fallLabel(s: Sterbefall): string {
  return (
    s.verstorbenerName?.trim() ||
    [s.verstorbenerVorname, s.verstorbenerNachname].filter(Boolean).join(' ') ||
    s.sterbefallId ||
    s.id
  );
}

function toOptions(sterbefaelle: Sterbefall[]): FallOption[] {
  return sterbefaelle
    .map((s) => ({
      docId: s.id,
      sterbefallId: s.sterbefallId ?? s.id,
      name: fallLabel(s),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

export function ZusatzTerminDialog({
  open,
  initialDayKey,
  existing,
  sterbefaelle,
  pending,
  error,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const titleId = useId();
  const options = useMemo(() => toOptions(sterbefaelle), [sterbefaelle]);
  const [docId, setDocId] = useState('');
  const [art, setArt] = useState<ZusatzTerminArt>('graben');
  const [title, setTitle] = useState('Graben für Begräbnis');
  const [dayKey, setDayKey] = useState(dayKeyFromDate(new Date()));
  const [zeit, setZeit] = useState('');
  const [ort, setOrt] = useState('');
  const [note, setNote] = useState('');
  const [fallQuery, setFallQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setDocId(existing.docId);
      setArt(existing.art);
      setTitle(existing.title);
      setDayKey(existing.dayKey);
      setZeit(existing.zeit ?? '');
      setOrt(existing.ort ?? '');
      setNote(existing.note ?? '');
      setFallQuery('');
      return;
    }
    setDocId(options[0]?.docId ?? '');
    setArt('graben');
    setTitle('Graben für Begräbnis');
    setDayKey(initialDayKey || dayKeyFromDate(new Date()));
    setZeit('');
    setOrt('');
    setNote('');
    setFallQuery('');
  }, [open, existing, initialDayKey, options]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, pending]);

  const filteredOptions = useMemo(() => {
    const q = fallQuery.trim().toLowerCase();
    if (!q) return options.slice(0, 40);
    return options
      .filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          o.sterbefallId.toLowerCase().includes(q) ||
          o.docId.toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [options, fallQuery]);

  const selected = options.find((o) => o.docId === docId) ?? null;
  const canSave = Boolean(docId && title.trim() && dayKey && /^\d{4}-\d{2}-\d{2}$/.test(dayKey));

  if (!open) return null;

  return createPortal(
    <div
      className="zusatz-termin-backdrop"
      role="presentation"
      onClick={() => {
        if (!pending) onClose();
      }}
    >
      <div
        className="zusatz-termin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="zusatz-termin-head">
          <div>
            <p className="zusatz-termin-kicker">Zusatztermin</p>
            <h2 id={titleId}>{existing ? 'Termin bearbeiten' : 'Termin zu Fall anlegen'}</h2>
            <p className="zusatz-termin-sub">z. B. Graben für Begräbnis — erscheint im Kalender</p>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={pending}>
            Schließen
          </button>
        </header>

        <div className="zusatz-termin-presets" role="group" aria-label="Vorschläge">
          {ZUSATZ_TERMIN_PRESETS.map((p) => (
            <button
              key={`${p.art}:${p.title}`}
              type="button"
              className={`zusatz-termin-preset ${art === p.art && title === p.title ? 'is-active' : ''}`}
              disabled={pending}
              onClick={() => {
                setArt(p.art);
                setTitle(p.title);
              }}
            >
              {p.title}
            </button>
          ))}
        </div>

        <div className="zusatz-termin-fields">
          <label className="zusatz-termin-field">
            <span>Fall suchen</span>
            <input
              type="search"
              value={fallQuery}
              onChange={(e) => setFallQuery(e.target.value)}
              placeholder="Name oder Sterbefall-Nr."
              disabled={pending || Boolean(existing)}
            />
          </label>

          <label className="zusatz-termin-field">
            <span>Fall *</span>
            <select
              value={docId}
              onChange={(e) => setDocId(e.target.value)}
              disabled={pending || Boolean(existing)}
            >
              <option value="">— wählen —</option>
              {filteredOptions.map((o) => (
                <option key={o.docId} value={o.docId}>
                  {o.name}
                  {o.sterbefallId ? ` (#${o.sterbefallId})` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="zusatz-termin-field">
            <span>Art</span>
            <select
              value={art}
              onChange={(e) => setArt(e.target.value as ZusatzTerminArt)}
              disabled={pending}
            >
              {(Object.keys(ZUSATZ_TERMIN_ART_LABELS) as ZusatzTerminArt[]).map((a) => (
                <option key={a} value={a}>
                  {ZUSATZ_TERMIN_ART_LABELS[a]}
                </option>
              ))}
            </select>
          </label>

          <label className="zusatz-termin-field">
            <span>Bezeichnung *</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={pending}
              placeholder="Graben für Begräbnis"
            />
          </label>

          <div className="zusatz-termin-row">
            <label className="zusatz-termin-field">
              <span>Datum *</span>
              <input
                type="date"
                value={dayKey}
                onChange={(e) => setDayKey(e.target.value)}
                disabled={pending}
              />
            </label>
            <label className="zusatz-termin-field">
              <span>Uhrzeit</span>
              <input
                type="time"
                value={zeit}
                onChange={(e) => setZeit(e.target.value)}
                disabled={pending}
              />
            </label>
          </div>

          <label className="zusatz-termin-field">
            <span>Ort</span>
            <input
              type="text"
              value={ort}
              onChange={(e) => setOrt(e.target.value)}
              disabled={pending}
              placeholder="optional"
            />
          </label>

          <label className="zusatz-termin-field">
            <span>Notiz</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={pending}
              placeholder="optional"
            />
          </label>
        </div>

        {error && (
          <p className="board-inline-error" role="alert">
            {error}
          </p>
        )}

        <footer className="zusatz-termin-actions">
          {existing && onDelete && (
            <button type="button" className="btn-ghost" disabled={pending} onClick={onDelete}>
              Löschen
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={onClose} disabled={pending}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={pending || !canSave}
            onClick={() => {
              if (!selected && !existing) return;
              const fall = selected ?? {
                docId,
                sterbefallId: existing?.sterbefallId ?? docId,
                name: existing?.name ?? '',
              };
              onSave({
                id: existing?.id ?? crypto.randomUUID(),
                docId: fall.docId,
                sterbefallId: fall.sterbefallId,
                name: fall.name,
                art,
                title: title.trim(),
                dayKey,
                zeit: zeit.trim() || undefined,
                ort: ort.trim() || undefined,
                note: note.trim() || undefined,
                updatedAtMs: Date.now(),
              });
            }}
          >
            {pending ? 'Speichert…' : existing ? 'Speichern' : 'Anlegen'}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
