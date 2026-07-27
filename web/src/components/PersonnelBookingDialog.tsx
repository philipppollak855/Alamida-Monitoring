import { useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { WallCalendarEntry } from '../board/wallCalendar';
import {
  arrangeurIdsBookedOnDay,
  availableTraegerPool,
  defaultRequiredTraegerCount,
  isBegraebnisEntry,
  validatePersonnelBooking,
} from '../board/personnelBookingRules';
import type { DispositionPerson } from '../types/dispositionSettings';
import type { PersonnelBooking } from '../types/personnelBooking';
import { WallCalBestattungsBadge } from './WallCalBestattungsBadge';

type Props = {
  entry: WallCalendarEntry | null;
  personnelPool: DispositionPerson[];
  /** Alle Personalbuchungen — Arrangeure am gleichen Tag sind als Träger gesperrt. */
  allBookings?: Record<string, PersonnelBooking>;
  existing: PersonnelBooking | null;
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (booking: PersonnelBooking) => void;
  onClear?: () => void;
};

export function PersonnelBookingDialog({
  entry,
  personnelPool,
  allBookings = {},
  existing,
  pending,
  error,
  onClose,
  onSave,
  onClear,
}: Props) {
  const titleId = useId();
  const [arrangeurId, setArrangeurId] = useState<string>('');
  const [traegerIds, setTraegerIds] = useState<string[]>([]);
  const [traegerVonFamilie, setTraegerVonFamilie] = useState(false);
  const [requiredTraegerCount, setRequiredTraegerCount] = useState(0);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!entry) return;
    const family = existing?.traegerVonFamilie === true;
    const nextArrangeur = existing?.arrangeurId ?? '';
    const nextTraeger = (existing?.traegerIds ?? []).filter((id) => id !== nextArrangeur);
    setArrangeurId(nextArrangeur);
    setTraegerIds(nextTraeger);
    setTraegerVonFamilie(family);
    setRequiredTraegerCount(
      existing?.requiredTraegerCount ?? defaultRequiredTraegerCount(entry, family)
    );
    setNote(existing?.note ?? '');
  }, [entry, existing]);

  useEffect(() => {
    if (!entry) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [entry, onClose, pending]);

  const arrangeure = useMemo(
    () =>
      personnelPool.filter((p) => p.active !== false && p.roles.includes('arrangeur')),
    [personnelPool]
  );

  const bookedArrangeurIds = useMemo(() => {
    if (!entry) return new Set<string>();
    return arrangeurIdsBookedOnDay(allBookings, entry.dayKey, entry.id);
  }, [allBookings, entry]);

  const traeger = useMemo(() => {
    const pool = personnelPool.filter(
      (p) => p.active !== false && p.roles.includes('traeger')
    );
    return availableTraegerPool(pool, {
      selectedArrangeurId: arrangeurId || null,
      bookedArrangeurIds,
    });
  }, [personnelPool, arrangeurId, bookedArrangeurIds]);

  const validation = useMemo(() => {
    if (!entry) {
      return {
        ok: false,
        errors: [],
        warnings: [],
        minTraeger: 0,
        requiresArrangeur: false,
        isBegraebnis: false,
      };
    }
    return validatePersonnelBooking(entry, {
      arrangeurId: arrangeurId || null,
      traegerIds,
      traegerVonFamilie,
      requiredTraegerCount,
    });
  }, [entry, arrangeurId, traegerIds, traegerVonFamilie, requiredTraegerCount]);

  if (!entry) return null;

  const begraebnis = isBegraebnisEntry(entry);

  function selectArrangeur(nextId: string) {
    setArrangeurId(nextId);
    if (nextId) {
      setTraegerIds((prev) => prev.filter((id) => id !== nextId));
    }
  }

  function toggleTraeger(id: string) {
    if (id === arrangeurId || bookedArrangeurIds.has(id)) return;
    setTraegerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function handleFamilyToggle(next: boolean) {
    setTraegerVonFamilie(next);
    setRequiredTraegerCount(defaultRequiredTraegerCount(entry!, next));
  }

  return createPortal(
    <div
      className="personnel-booking-backdrop"
      role="presentation"
      onClick={() => {
        if (!pending) onClose();
      }}
    >
      <div
        className="personnel-booking-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="personnel-booking-head">
          <div>
            <p className="personnel-booking-kicker">Personal einbuchen</p>
            <h2 id={titleId}>
              {entry.bestattungsMarker && (
                <WallCalBestattungsBadge marker={entry.bestattungsMarker} />
              )}{' '}
              {entry.name}
            </h2>
            <p className="personnel-booking-sub">
              {entry.dayLabel} · {entry.timeLabel} · {entry.badges.join(' · ') || entry.title}
            </p>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={pending}>
            Schließen
          </button>
        </header>

        {begraebnis && (
          <p className="personnel-booking-rule">
            Begräbnis: 1 Arrangeur erforderlich. Eingebuchter Arrangeur ist nicht als Träger
            wählbar.
            {entry.bestattungsMarker === 'S' && !traegerVonFamilie
              ? ' Sarg ohne Träger von Familie → mind. 4 Träger.'
              : null}
          </p>
        )}

        <div className="personnel-booking-fields">
          <label className="personnel-booking-field">
            <span>Arrangeur{validation.requiresArrangeur ? ' *' : ''}</span>
            <select
              value={arrangeurId}
              onChange={(e) => selectArrangeur(e.target.value)}
              disabled={pending}
            >
              <option value="">— wählen —</option>
              {arrangeure.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="personnel-booking-check">
            <input
              type="checkbox"
              checked={traegerVonFamilie}
              onChange={(e) => handleFamilyToggle(e.target.checked)}
              disabled={pending}
            />
            <span>Träger von Familie</span>
          </label>

          {!traegerVonFamilie && (
            <>
              <label className="personnel-booking-field">
                <span>
                  Trägeranzahl
                  {validation.minTraeger > 0 ? ` (mind. ${validation.minTraeger})` : ''}
                </span>
                <input
                  type="number"
                  min={validation.minTraeger}
                  max={20}
                  value={requiredTraegerCount}
                  onChange={(e) =>
                    setRequiredTraegerCount(Math.max(0, parseInt(e.target.value, 10) || 0))
                  }
                  disabled={pending}
                />
              </label>

              <fieldset className="personnel-booking-pool">
                <legend>Träger aus Poolliste ({traegerIds.length} gewählt)</legend>
                {traeger.length === 0 ? (
                  <p className="personnel-booking-empty">
                    {personnelPool.some(
                      (p) => p.active !== false && p.roles.includes('traeger')
                    )
                      ? 'Keine verfügbaren Träger — Arrangeure sind hier ausgeschlossen.'
                      : 'Keine Träger im Pool — unter Disposition → Einstellungen anlegen.'}
                  </p>
                ) : (
                  <div className="personnel-booking-pool-list">
                    {traeger.map((p) => (
                      <label key={p.id} className="personnel-booking-pool-item">
                        <input
                          type="checkbox"
                          checked={traegerIds.includes(p.id)}
                          onChange={() => toggleTraeger(p.id)}
                          disabled={pending}
                        />
                        <span>{p.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
            </>
          )}

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
        </div>

        {validation.errors.map((msg) => (
          <p key={msg} className="board-inline-error" role="alert">
            {msg}
          </p>
        ))}
        {validation.warnings.map((msg) => (
          <p key={msg} className="personnel-booking-warn">
            {msg}
          </p>
        ))}
        {error && (
          <p className="board-inline-error" role="alert">
            {error}
          </p>
        )}

        <footer className="personnel-booking-actions">
          {existing && onClear && (
            <button
              type="button"
              className="btn-ghost"
              disabled={pending}
              onClick={onClear}
            >
              Einbuchung löschen
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={onClose} disabled={pending}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={pending || !validation.ok}
            onClick={() => {
              const cleanTraeger = traegerIds.filter((id) => id !== arrangeurId);
              onSave({
                id: entry.id,
                docId: entry.docId,
                sterbefallId: entry.sterbefallId,
                dayKey: entry.dayKey,
                entryTitle: entry.title,
                entryArts: entry.arts,
                timeLabel: entry.timeLabel,
                name: entry.name,
                bestattungsMarker: entry.bestattungsMarker,
                arrangeurId: arrangeurId || null,
                traegerIds: cleanTraeger,
                traegerVonFamilie,
                requiredTraegerCount,
                note: note.trim() || undefined,
                updatedAtMs: Date.now(),
              });
            }}
          >
            {pending ? 'Speichert…' : 'Einbuchen'}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
