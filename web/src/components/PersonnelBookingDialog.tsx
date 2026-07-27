import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { WallCalendarEntry } from '../board/wallCalendar';
import {
  calendarBestattungsMarker,
  resolveBestattungsMarkerOverride,
  type BestattungsMarker,
} from '../board/feierterminLogic';
import {
  arrangeurIdsBookedOnDay,
  availableTraegerPool,
  defaultRequiredTraegerCount,
  isBegraebnisEntry,
  isTraegerOnlyArrangeur,
  isUeberfuehrungEntry,
  personUnavailableReason,
  unavailableReasonLabel,
  validatePersonnelBooking,
} from '../board/personnelBookingRules';
import type { DispositionPerson } from '../types/dispositionSettings';
import type { PersonnelAbsence, PersonnelBooking } from '../types/personnelBooking';
import type { Sterbefall } from '../types';
import { BestattungsMarkerSwitch } from './BestattungsMarkerSwitch';
import { WallCalBestattungsBadge } from './WallCalBestattungsBadge';

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
    const isTransfer = isUeberfuehrungEntry(entry);
    const nextArrangeur = isTransfer ? '' : (existing?.arrangeurId ?? '');
    const nextTraeger = [
      ...(isTransfer && existing?.arrangeurId ? [existing.arrangeurId] : []),
      ...(existing?.traegerIds ?? []),
    ].filter((id, i, arr) => id !== nextArrangeur && arr.indexOf(id) === i);
    const nextOverride = resolveBestattungsMarkerOverride(sterbefall ?? {});
    const entryForRules = {
      ...entry,
      bestattungsMarker: nextOverride ?? autoMarker ?? entry.bestattungsMarker,
    };
    setArrangeurId(nextArrangeur);
    setTraegerIds(nextTraeger);
    setTraegerVonFamilie(isTransfer ? false : family);
    setRequiredTraegerCount(
      isTransfer
        ? Math.min(nextTraeger.length || 1, 2)
        : (existing?.requiredTraegerCount ?? defaultRequiredTraegerCount(entryForRules, family))
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

  const arrangeure = useMemo(() => {
    // Arrangeure zuerst; Träger ohne Arrangeur-Rolle nachrangig wählbar.
    return personnelPool
      .filter(
        (p) =>
          p.active !== false &&
          (p.roles.includes('arrangeur') || p.roles.includes('traeger'))
      )
      .map((p) => {
        const reason =
          entry &&
          personUnavailableReason(p.id, entry.dayKey, {
            absences,
            bookings: allBookings,
            excludeBookingId: entry.id,
            asRole: 'arrangeur',
          });
        const traegerOnly =
          !p.roles.includes('arrangeur') && p.roles.includes('traeger');
        return { ...p, unavailable: reason, traegerOnly };
      })
      .sort((a, b) => {
        if (a.traegerOnly !== b.traegerOnly) return a.traegerOnly ? 1 : -1;
        return a.name.localeCompare(b.name, 'de');
      });
  }, [personnelPool, entry, absences, allBookings]);

  const bookedArrangeurIds = useMemo(() => {
    if (!entry) return new Set<string>();
    return arrangeurIdsBookedOnDay(allBookings, entry.dayKey, entry.id);
  }, [allBookings, entry]);

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
        });
      const blockedAsArrangeur = Boolean(arrangeurId && p.id === arrangeurId);
      return {
        ...p,
        unavailable: blockedAsArrangeur ? ('booked-arrangeur' as const) : reason,
      };
    });
  }, [personnelPool, arrangeurId, entry, absences, allBookings]);

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
        isUeberfuehrung: false,
        maxPersonen: null as number | null,
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
      personnelPool
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

  const activeEntry = entry;
  const begraebnis = isBegraebnisEntry(activeEntry);
  const ueberfuehrung = isUeberfuehrungEntry(activeEntry);
  const maxPersonen = validation.maxPersonen ?? null;
  const showArrangeur = !ueberfuehrung;
  const showFamilyAndMarker = !ueberfuehrung;

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
    if (id === arrangeurId || bookedArrangeurIds.has(id)) return;
    setTraegerIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (maxPersonen != null && prev.length >= maxPersonen) return prev;
      return [...prev, id];
    });
  }

  function confirmAndSave() {
    const cleanTraeger = traegerIds.filter((id) => id !== arrangeurId);
    const nextArrangeur = ueberfuehrung ? null : arrangeurId || null;
    if (
      nextArrangeur &&
      isTraegerOnlyArrangeur(nextArrangeur, personnelPool) &&
      !window.confirm(
        'Die gewählte Person ist nur als Träger hinterlegt und wird als Arrangeur nicht priorisiert. Trotzdem einbuchen?'
      )
    ) {
      return;
    }
    onSave({
      id: activeEntry.id,
      docId: activeEntry.docId,
      sterbefallId: activeEntry.sterbefallId,
      dayKey: activeEntry.dayKey,
      entryTitle: activeEntry.title,
      entryArts: activeEntry.arts,
      timeLabel: activeEntry.timeLabel,
      name: activeEntry.name,
      bestattungsMarker: ueberfuehrung ? undefined : effectiveMarker,
      arrangeurId: nextArrangeur,
      traegerIds: cleanTraeger,
      traegerVonFamilie: ueberfuehrung ? false : traegerVonFamilie,
      requiredTraegerCount: ueberfuehrung
        ? Math.min(cleanTraeger.length, maxPersonen ?? 2)
        : requiredTraegerCount,
      note: note.trim() || undefined,
      updatedAtMs: Date.now(),
    });
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

        {showFamilyAndMarker && onMarkerOverrideChange && (
          <BestattungsMarkerSwitch
            override={markerOverride}
            effective={effectiveMarker ?? 'S'}
            pending={markerPending}
            disabled={pending}
            onChange={(next) => void handleMarkerChange(next)}
          />
        )}

        {begraebnis && (
          <p className="personnel-booking-rule">
            Begräbnis: 1 Arrangeur erforderlich. Eingebuchter Arrangeur ist nicht als Träger
            wählbar. Träger ohne Arrangeur-Rolle sind wählbar, werden aber nicht priorisiert.
            {effectiveMarker === 'S' && !traegerVonFamilie
              ? ' Sarg ohne Träger von Familie → mind. 4 Träger.'
              : null}
          </p>
        )}

        {ueberfuehrung && (
          <p className="personnel-booking-rule">
            Überführung: maximal {maxPersonen ?? 2} Personen aus dem Pool (Firma oder Extern).
          </p>
        )}

        <div className="personnel-booking-fields">
          {showArrangeur && (
            <label className="personnel-booking-field">
              <span>Arrangeur{validation.requiresArrangeur ? ' *' : ''}</span>
              <select
                value={arrangeurId}
                onChange={(e) => selectArrangeur(e.target.value)}
                disabled={pending}
              >
                <option value="">— wählen —</option>
                {arrangeure.map((p) => (
                  <option key={p.id} value={p.id} disabled={Boolean(p.unavailable)}>
                    {p.name}
                    {p.extern ? ' (extern)' : ''}
                    {p.traegerOnly ? ' · Träger' : ''}
                    {p.unavailable ? ` (${unavailableReasonLabel(p.unavailable)})` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          {showFamilyAndMarker && (
            <label className="personnel-booking-check">
              <input
                type="checkbox"
                checked={traegerVonFamilie}
                onChange={(e) => handleFamilyToggle(e.target.checked)}
                disabled={pending}
              />
              <span>Träger von Familie</span>
            </label>
          )}

          {(!showFamilyAndMarker || !traegerVonFamilie) && (
            <>
              {showFamilyAndMarker && (
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
              )}

              <fieldset className="personnel-booking-pool">
                <legend>
                  {ueberfuehrung
                    ? `Personal (${traegerIds.length}/${maxPersonen ?? 2})`
                    : `Träger aus Poolliste (${traegerIds.length} gewählt)`}
                </legend>
                <div
                  className="personnel-booking-pool-tabs"
                  role="tablist"
                  aria-label={ueberfuehrung ? 'Personal-Herkunft' : 'Träger-Herkunft'}
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
                      const atMax =
                        ueberfuehrung &&
                        maxPersonen != null &&
                        !traegerIds.includes(p.id) &&
                        traegerIds.length >= maxPersonen;
                      return (
                        <label
                          key={p.id}
                          className={`personnel-booking-pool-item${
                            unavailable || atMax ? ' is-unavailable' : ''
                          }${p.extern ? ' is-extern' : ''}`}
                          title={
                            p.unavailable
                              ? unavailableReasonLabel(p.unavailable)
                              : atMax
                                ? `Maximal ${maxPersonen} Personen`
                                : undefined
                          }
                        >
                          <input
                            type="checkbox"
                            checked={traegerIds.includes(p.id)}
                            onChange={() => toggleTraeger(p.id)}
                            disabled={pending || unavailable || atMax}
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
            Abbrechen
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={pending || markerPending || !validation.ok}
            onClick={confirmAndSave}
          >
            {pending ? 'Speichert…' : 'Einbuchen'}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
