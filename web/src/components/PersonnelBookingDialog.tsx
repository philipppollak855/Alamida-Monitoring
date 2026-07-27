import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { WallCalendarEntry } from '../board/wallCalendar';
import {
  isFahrerTransferEntry,
  isKremationTransferEntry,
} from '../board/wallCalendar';
import {
  calendarBestattungsMarker,
  resolveBestattungsMarkerOverride,
  type BestattungsMarker,
} from '../board/feierterminLogic';
import {
  availableTraegerPool,
  defaultRequiredTraegerCount,
  isBegraebnisEntry,
  personUnavailableReason,
  unavailableReasonLabel,
  validatePersonnelBooking,
} from '../board/personnelBookingRules';
import type { DispositionPerson } from '../types/dispositionSettings';
import type { PersonnelAbsence, PersonnelBooking } from '../types/personnelBooking';
import type { Sterbefall } from '../types';
import { BestattungsMarkerSwitch } from './BestattungsMarkerSwitch';
import { WallCalBestattungsBadge } from './WallCalBestattungsBadge';

type ArrangeurOption = DispositionPerson & {
  unavailable: ReturnType<typeof personUnavailableReason>;
  isArrangeurRole: boolean;
};

type Props = {
  entry: WallCalendarEntry | null;
  sterbefall?: Sterbefall | null;
  personnelPool: DispositionPerson[];
  /** Alle Personalbuchungen — Arrangeure am gleichen Tag sind als Träger gesperrt. */
  allBookings?: Record<string, PersonnelBooking>;
  absences?: Record<string, PersonnelAbsence>;
  existing: PersonnelBooking | null;
  pending?: boolean;
  markerPending?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (booking: PersonnelBooking) => void;
  onClear?: () => void;
  onMarkerOverrideChange?: (marker: BestattungsMarker | null) => void | Promise<void>;
};

export function PersonnelBookingDialog({
  entry,
  sterbefall,
  personnelPool,
  allBookings = {},
  absences = {},
  existing,
  pending,
  markerPending,
  error,
  onClose,
  onSave,
  onClear,
  onMarkerOverrideChange,
}: Props) {
  const titleId = useId();
  const closeOnBackdrop = useRef(false);
  const [arrangeurId, setArrangeurId] = useState<string>('');
  const [traegerIds, setTraegerIds] = useState<string[]>([]);
  const [traegerVonFamilie, setTraegerVonFamilie] = useState(false);
  const [requiredTraegerCount, setRequiredTraegerCount] = useState(0);
  const [note, setNote] = useState('');
  const [markerOverride, setMarkerOverride] = useState<BestattungsMarker | null>(null);
  const [traegerTab, setTraegerTab] = useState<'firma' | 'extern'>('firma');

  const autoMarker = useMemo(() => {
    if (!entry) return undefined;
    return calendarBestattungsMarker(
      { ...(sterbefall ?? { id: entry.docId }), bestattungsMarkerOverride: null },
      entry.arts,
      entry.title
    );
  }, [entry, sterbefall]);

  const effectiveMarker = markerOverride ?? autoMarker ?? entry?.bestattungsMarker;

  useEffect(() => {
    if (!entry) return;
    const family = existing?.traegerVonFamilie === true;
    const nextArrangeur = existing?.arrangeurId ?? '';
    const nextTraeger = (existing?.traegerIds ?? []).filter((id) => id !== nextArrangeur);
    const nextOverride = resolveBestattungsMarkerOverride(sterbefall ?? {});
    const entryForRules = {
      ...entry,
      bestattungsMarker: nextOverride ?? autoMarker ?? entry.bestattungsMarker,
    };
    setArrangeurId(nextArrangeur);
    setTraegerIds(nextTraeger);
    setTraegerVonFamilie(family);
    setRequiredTraegerCount(
      existing?.requiredTraegerCount ?? defaultRequiredTraegerCount(entryForRules, family)
    );
    setNote(existing?.note ?? '');
    setMarkerOverride(nextOverride);
    const hasExternSelected = nextTraeger.some((id) =>
      personnelPool.some((p) => p.id === id && p.extern === true)
    );
    setTraegerTab(hasExternSelected ? 'extern' : 'firma');
  }, [entry, existing, sterbefall, autoMarker, personnelPool]);

  useEffect(() => {
    if (!entry) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending && !markerPending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [entry, onClose, pending, markerPending]);

  const arrangeure = useMemo((): ArrangeurOption[] => {
    // Alle aktiven Personen wählbar; Arrangeure oben und hervorgehoben.
    const list = personnelPool
      .filter((p) => p.active !== false)
      .map((p) => {
        const reason =
          entry &&
          personUnavailableReason(p.id, entry.dayKey, {
            absences,
            bookings: allBookings,
            excludeBookingId: entry.id,
            asRole: 'arrangeur',
            timeLabel: entry.timeLabel,
          });
        return {
          ...p,
          unavailable: reason,
          isArrangeurRole: p.roles.includes('arrangeur'),
        };
      });
    return list.sort((a, b) => {
      if (a.isArrangeurRole !== b.isArrangeurRole) return a.isArrangeurRole ? -1 : 1;
      return a.name.localeCompare(b.name, 'de');
    });
  }, [personnelPool, entry, absences, allBookings]);

  const arrangeureMitRolle = useMemo(
    () => arrangeure.filter((p) => p.isArrangeurRole),
    [arrangeure]
  );
  const arrangeureOhneRolle = useMemo(
    () => arrangeure.filter((p) => !p.isArrangeurRole),
    [arrangeure]
  );

  const isKremationTransfer = Boolean(entry && isKremationTransferEntry(entry));
  const isFahrerMode = Boolean(entry && isFahrerTransferEntry(entry) && !entry.attachedTransfer);

  const traeger = useMemo(() => {
    const pool = personnelPool.filter(
      (p) => p.active !== false && p.roles.includes('traeger')
    );
    // Arrangeur-Auswahl immer raus; Abwesende/Eingebuchte ausgegraut behalten.
    const withoutSelectedArrangeur = availableTraegerPool(pool, {
      selectedArrangeurId: arrangeurId || null,
      bookedArrangeurIds: [],
    });
    return withoutSelectedArrangeur.map((p) => {
      const reason =
        entry &&
        personUnavailableReason(p.id, entry.dayKey, {
          absences,
          bookings: allBookings,
          excludeBookingId: entry.id,
          asRole: 'traeger',
          timeLabel: entry.timeLabel,
        });
      const blockedAsArrangeur = Boolean(arrangeurId && p.id === arrangeurId);
      return {
        ...p,
        unavailable: blockedAsArrangeur ? ('booked-arrangeur' as const) : reason,
      };
    });
  }, [personnelPool, arrangeurId, entry, absences, allBookings]);

  const fahrer = useMemo(() => {
    return personnelPool
      .filter((p) => p.active !== false && p.roles.includes('fahrer'))
      .map((p) => {
        const reason =
          entry &&
          personUnavailableReason(p.id, entry.dayKey, {
            absences,
            bookings: allBookings,
            excludeBookingId: entry.id,
            asRole: 'traeger',
            timeLabel: entry.timeLabel,
          });
        return { ...p, unavailable: reason };
      });
  }, [personnelPool, entry, absences, allBookings]);

  const traegerFirma = useMemo(
    () => traeger.filter((p) => p.extern !== true),
    [traeger]
  );
  const traegerExtern = useMemo(
    () => traeger.filter((p) => p.extern === true),
    [traeger]
  );
  const visibleTraeger = traegerTab === 'extern' ? traegerExtern : traegerFirma;
  const selectedFirmaCount = traegerIds.filter((id) =>
    traegerFirma.some((p) => p.id === id)
  ).length;
  const selectedExternCount = traegerIds.filter((id) =>
    traegerExtern.some((p) => p.id === id)
  ).length;

  const entryForValidation = useMemo(() => {
    if (!entry) return null;
    return { ...entry, bestattungsMarker: effectiveMarker };
  }, [entry, effectiveMarker]);

  const validation = useMemo(() => {
    if (!entryForValidation) {
      return {
        ok: false,
        errors: [],
        warnings: [],
        minTraeger: 0,
        requiresArrangeur: false,
        isBegraebnis: false,
      };
    }
    if (isKremationTransferEntry(entryForValidation)) {
      return {
        ok: true,
        errors: [],
        warnings: [],
        minTraeger: 0,
        requiresArrangeur: false,
        isBegraebnis: false,
      };
    }
    if (isFahrerTransferEntry(entryForValidation)) {
      return {
        ok: true,
        errors: [],
        warnings: [],
        minTraeger: 0,
        requiresArrangeur: false,
        isBegraebnis: false,
      };
    }
    return validatePersonnelBooking(
      entryForValidation,
      {
        arrangeurId: arrangeurId || null,
        traegerIds,
        traegerVonFamilie,
        requiredTraegerCount,
      },
      { personnelPool }
    );
  }, [
    entryForValidation,
    arrangeurId,
    traegerIds,
    traegerVonFamilie,
    requiredTraegerCount,
    personnelPool,
  ]);

  if (!entry || !entryForValidation) return null;

  const begraebnis = isBegraebnisEntry(entry);

  function selectArrangeur(nextId: string) {
    if (nextId) {
      const person = arrangeure.find((p) => p.id === nextId);
      if (person?.unavailable) return;
    }
    setArrangeurId(nextId);
    if (nextId) {
      setTraegerIds((prev) => prev.filter((id) => id !== nextId));
    }
  }

  function toggleTraeger(id: string) {
    const person = traeger.find((p) => p.id === id);
    if (person?.unavailable) return;
    if (id === arrangeurId) return;
    setTraegerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleFahrer(id: string) {
    const person = fahrer.find((p) => p.id === id);
    if (person?.unavailable) return;
    setTraegerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function handleFamilyToggle(next: boolean) {
    setTraegerVonFamilie(next);
    setRequiredTraegerCount(defaultRequiredTraegerCount(entryForValidation!, next));
  }

  async function handleMarkerChange(next: BestattungsMarker | null) {
    setMarkerOverride(next);
    const entryForRules = { ...entry!, bestattungsMarker: next ?? autoMarker };
    setRequiredTraegerCount((prev) =>
      Math.max(prev, defaultRequiredTraegerCount(entryForRules, traegerVonFamilie))
    );
    if (onMarkerOverrideChange) {
      await onMarkerOverrideChange(next);
    }
  }

  return createPortal(
    <div
      className="personnel-booking-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        closeOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={() => {
        if (closeOnBackdrop.current && !pending && !markerPending) onClose();
        closeOnBackdrop.current = false;
      }}
    >
      <div
        className="personnel-booking-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="personnel-booking-head">
          <div>
            <p className="personnel-booking-kicker">Personal einbuchen</p>
            <h2 id={titleId}>
              {effectiveMarker && <WallCalBestattungsBadge marker={effectiveMarker} />}{' '}
              {entry.name}
            </h2>
            <p className="personnel-booking-sub">
              {entry.dayLabel} · {entry.timeLabel} · {entry.badges.join(' · ') || entry.title}
            </p>
          </div>
          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
            disabled={pending || markerPending}
          >
            Schließen
          </button>
        </header>

        {onMarkerOverrideChange && !isFahrerMode && !isKremationTransfer && (
          <BestattungsMarkerSwitch
            override={markerOverride}
            effective={effectiveMarker ?? 'S'}
            pending={markerPending}
            disabled={pending}
            onChange={(next) => void handleMarkerChange(next)}
          />
        )}

        {begraebnis && !isFahrerMode && !isKremationTransfer && (
          <p className="personnel-booking-rule">
            Begräbnis: 1 Arrangeur erforderlich (auch Träger/Fahrer wählbar — mit Warnung).
            Eingebuchter Arrangeur ist nicht als Träger wählbar. Personal darf am selben Tag
            woanders stehen, außer im Zeitfenster ±30 Min.
            {effectiveMarker === 'S' && !traegerVonFamilie
              ? ' Sarg ohne Träger von Familie → mind. 4 Träger.'
              : null}
          </p>
        )}

        {entry.attachedTransfer && (
          <p className="personnel-booking-rule">
            Überführung ist diesem Termin zugehörig — kein separates Personal für die Überführung.
          </p>
        )}

        {isKremationTransfer && (
          <p className="personnel-booking-rule">
            Standard-Kremationsüberführung: kein Personal nötig.
          </p>
        )}

        {isFahrerMode && (
          <p className="personnel-booking-rule">
            Überführung: nur Fahrer aus dem Pool einbuchen (optional).
          </p>
        )}

        {isKremationTransfer ? (
          <div className="personnel-booking-fields">
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
        ) : isFahrerMode ? (
          <div className="personnel-booking-fields">
            <fieldset className="personnel-booking-pool">
              <legend>Fahrer aus Poolliste ({traegerIds.length} gewählt)</legend>
              {fahrer.length === 0 ? (
                <p className="personnel-booking-empty">
                  Keine Fahrer im Pool — unter Disposition → Einstellungen Rolle „Fahrer“ setzen.
                </p>
              ) : (
                <div className="personnel-booking-pool-list">
                  {fahrer.map((p) => {
                    const unavailable = Boolean(p.unavailable);
                    return (
                      <label
                        key={p.id}
                        className={`personnel-booking-pool-item${
                          unavailable ? ' is-unavailable' : ''
                        }${p.extern ? ' is-extern' : ''}`}
                        title={
                          p.unavailable ? unavailableReasonLabel(p.unavailable) : undefined
                        }
                      >
                        <input
                          type="checkbox"
                          checked={traegerIds.includes(p.id)}
                          onChange={() => toggleFahrer(p.id)}
                          disabled={pending || unavailable}
                        />
                        <span>
                          {p.name}
                          {p.extern ? (
                            <em className="personnel-booking-extern-badge"> Extern</em>
                          ) : null}
                          {p.unavailable ? (
                            <em className="personnel-booking-unavailable-hint">
                              {' '}
                              · {unavailableReasonLabel(p.unavailable)}
                            </em>
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>

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
        ) : (
        <div className="personnel-booking-fields">
          <label className="personnel-booking-field">
            <span>Arrangeur{validation.requiresArrangeur ? ' *' : ''}</span>
            <select
              value={arrangeurId}
              onChange={(e) => selectArrangeur(e.target.value)}
              disabled={pending}
              className="personnel-booking-arrangeur-select"
            >
              <option value="">— wählen —</option>
              {arrangeureMitRolle.length > 0 && (
                <optgroup label="Arrangeure">
                  {arrangeureMitRolle.map((p) => (
                    <option
                      key={p.id}
                      value={p.id}
                      disabled={Boolean(p.unavailable)}
                      className="is-arrangeur-option"
                    >
                      {p.name}
                      {p.extern ? ' (extern)' : ''}
                      {p.unavailable ? ` (${unavailableReasonLabel(p.unavailable)})` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              {arrangeureOhneRolle.length > 0 && (
                <optgroup label="Weitere (kein Arrangeur)">
                  {arrangeureOhneRolle.map((p) => (
                    <option key={p.id} value={p.id} disabled={Boolean(p.unavailable)}>
                      {p.name}
                      {p.roles.length ? ` · ${p.roles.join(', ')}` : ''}
                      {p.extern ? ' (extern)' : ''}
                      {p.unavailable ? ` (${unavailableReasonLabel(p.unavailable)})` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
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
                <div
                  className="personnel-booking-pool-tabs"
                  role="tablist"
                  aria-label="Träger-Herkunft"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={traegerTab === 'firma'}
                    className={`personnel-booking-pool-tab${
                      traegerTab === 'firma' ? ' is-active' : ''
                    }`}
                    disabled={pending}
                    onClick={() => setTraegerTab('firma')}
                  >
                    Firma
                    {selectedFirmaCount > 0 ? ` (${selectedFirmaCount})` : ''}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={traegerTab === 'extern'}
                    className={`personnel-booking-pool-tab${
                      traegerTab === 'extern' ? ' is-active' : ''
                    }`}
                    disabled={pending}
                    onClick={() => setTraegerTab('extern')}
                  >
                    Extern
                    {selectedExternCount > 0 ? ` (${selectedExternCount})` : ''}
                  </button>
                </div>
                {visibleTraeger.length === 0 ? (
                  <p className="personnel-booking-empty">
                    {traegerTab === 'extern'
                      ? 'Keine externen Träger im Pool — unter Disposition → Einstellungen als „Extern“ markieren.'
                      : personnelPool.some(
                            (p) => p.active !== false && p.roles.includes('traeger')
                          )
                        ? 'Keine verfügbaren Firmen-Träger — Arrangeure sind hier ausgeschlossen.'
                        : 'Keine Träger im Pool — unter Disposition → Einstellungen anlegen.'}
                  </p>
                ) : (
                  <div className="personnel-booking-pool-list">
                    {visibleTraeger.map((p) => {
                      const unavailable = Boolean(p.unavailable);
                      return (
                        <label
                          key={p.id}
                          className={`personnel-booking-pool-item${
                            unavailable ? ' is-unavailable' : ''
                          }${p.extern ? ' is-extern' : ''}`}
                          title={
                            p.unavailable ? unavailableReasonLabel(p.unavailable) : undefined
                          }
                        >
                          <input
                            type="checkbox"
                            checked={traegerIds.includes(p.id)}
                            onChange={() => toggleTraeger(p.id)}
                            disabled={pending || unavailable}
                          />
                          <span>
                            {p.name}
                            {p.extern ? (
                              <em className="personnel-booking-extern-badge"> Extern</em>
                            ) : null}
                            {p.unavailable ? (
                              <em className="personnel-booking-unavailable-hint">
                                {' '}
                                · {unavailableReasonLabel(p.unavailable)}
                              </em>
                            ) : null}
                          </span>
                        </label>
                      );
                    })}
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
        )}

        {!isKremationTransfer && validation.errors.map((msg) => (
          <p key={msg} className="board-inline-error" role="alert">
            {msg}
          </p>
        ))}
        {!isKremationTransfer && validation.warnings.map((msg) => (
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
              disabled={pending || markerPending}
              onClick={onClear}
            >
              Einbuchung löschen
            </button>
          )}
          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
            disabled={pending || markerPending}
          >
            {isKremationTransfer && !existing ? 'Schließen' : 'Abbrechen'}
          </button>
          {!isKremationTransfer && (
            <button
              type="button"
              className="btn-primary"
              disabled={pending || markerPending || !validation.ok}
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
                  bestattungsMarker: isFahrerMode ? undefined : effectiveMarker,
                  arrangeurId: isFahrerMode ? null : arrangeurId || null,
                  traegerIds: cleanTraeger,
                  traegerVonFamilie: isFahrerMode ? false : traegerVonFamilie,
                  requiredTraegerCount: isFahrerMode ? 0 : requiredTraegerCount,
                  note: note.trim() || undefined,
                  updatedAtMs: Date.now(),
                });
              }}
            >
              {pending ? 'Speichert…' : 'Einbuchen'}
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body
  );
}
