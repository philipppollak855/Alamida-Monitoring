import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LiveDataBar } from '../components/LiveDataBar';
import { PersonnelAbsenceDialog } from '../components/PersonnelAbsenceDialog';
import { PersonnelBookingDialog } from '../components/PersonnelBookingDialog';
import { PlanningCenterDay } from '../components/planning/PlanningCenterDay';
import { PlanningKuehlraumRail } from '../components/planning/PlanningKuehlraumRail';
import { PlanningLocationRail } from '../components/planning/PlanningLocationRail';
import { PlanningScheduleDialog } from '../components/planning/PlanningScheduleDialog';
import {
  addDays,
  dayKeyFromDate,
  formatDayLabelDe,
  startOfWeekMonday,
} from '../board/dateUtils';
import { filterAktiveSterbefaelle } from '../board/historieLogic';
import { useCalendarDay } from '../hooks/useCalendarDay';
import { usePersonnelBookings } from '../hooks/usePersonnelBookings';
import { useSterbefaelle } from '../hooks/useSterbefaelle';
import { useTransferPlan } from '../hooks/useTransferPlan';
import { useDispositionSettings } from '../settings/SettingsProvider';
import {
  enrichPlanningCeremonies,
  wallEntryFromPlanningCeremony,
} from '../planning/planningPersonnel';
import {
  buildCeremoniesForFall,
  buildKuehlraumCapacities,
  buildKuehlraumRailStates,
  buildLocationGroups,
  buildPlanningCards,
  buildScheduleDraftFromCard,
  buildScheduleDraftFromOccupant,
  buildScheduleDraftFromSterbeort,
  buildSterbeortPool,
  cardsForLane,
  formatTerminDisplay,
  moveCardAssignment,
  nextOrderInLane,
  scheduleToKuehlraum,
  undoOrRemoveAssignment,
} from '../planning/transferPlanning';
import type {
  KuehlraumOccupant,
  PlanningCard,
  ScheduleDraft,
  SterbeortPoolItem,
} from '../planning/types';
import type { WallCalendarEntry } from '../board/wallCalendar';
import { firebaseConfigured } from '../firebase';
import { setSterbefallBestattungsMarkerOverride } from '../services/bestattungsMarkerOverride';
import type { BestattungsMarker } from '../board/feierterminLogic';

const HORIZON_DAYS = 7;

type DragState =
  | { kind: 'card'; card: PlanningCard }
  | { kind: 'source'; item: SterbeortPoolItem }
  | { kind: 'occupant'; occupant: KuehlraumOccupant; fromKuehlraumId: string }
  | null;

export function PlanningPage() {
  const calendarDay = useCalendarDay();
  const today = useMemo(() => {
    const [y, m, d] = calendarDay.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [calendarDay]);

  const [rangeStart, setRangeStart] = useState(() => startOfWeekMonday(new Date()));
  const [focusDayKey, setFocusDayKey] = useState<string>(() => calendarDay);
  const { settings } = useDispositionSettings();
  const { items: sterbefaelleRaw, loading: casesLoading, error: casesError } = useSterbefaelle();
  const { plan, loading: planLoading, saving, error: planError, savePlan, setError } =
    useTransferPlan();
  const {
    bookings,
    absences,
    saving: bookingSaving,
    error: bookingError,
    saveBooking,
    clearBooking,
    saveAbsence,
    clearAbsence,
    setError: setBookingError,
  } = usePersonnelBookings();

  const [drag, setDrag] = useState<DragState>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [flashId, setFlashId] = useState<string | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft | null>(null);
  const [bookingEntry, setBookingEntry] = useState<WallCalendarEntry | null>(null);
  const [absenceOpen, setAbsenceOpen] = useState(false);
  const [markerPending, setMarkerPending] = useState(false);

  const sterbefaelle = useMemo(
    () => filterAktiveSterbefaelle(sterbefaelleRaw),
    [sterbefaelleRaw]
  );

  const dayKeys = useMemo(
    () => Array.from({ length: HORIZON_DAYS }, (_, i) => dayKeyFromDate(addDays(rangeStart, i))),
    [rangeStart]
  );

  const cards = useMemo(
    () => buildPlanningCards(sterbefaelle, plan.assignments, settings, today),
    [sterbefaelle, plan.assignments, settings, today]
  );

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.sterbefallId.toLowerCase().includes(q) ||
        c.vonOrt.toLowerCase().includes(q) ||
        c.nachOrt.toLowerCase().includes(q)
    );
  }, [cards, search]);

  const capacities = useMemo(
    () => buildKuehlraumCapacities(sterbefaelle, cards, settings, dayKeys, today),
    [sterbefaelle, cards, settings, dayKeys, today]
  );

  const locationGroups = useMemo(() => {
    const pool = buildSterbeortPool(sterbefaelle, cards, settings, today);
    const q = search.trim().toLowerCase();
    const filtered = !q
      ? pool
      : pool.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.sterbefallId.toLowerCase().includes(q) ||
            p.vonOrt.toLowerCase().includes(q)
        );
    return buildLocationGroups(filtered);
  }, [sterbefaelle, cards, settings, today, search]);

  const krRails = useMemo(
    () => buildKuehlraumRailStates(sterbefaelle, cards, settings, focusDayKey, today),
    [sterbefaelle, cards, settings, focusDayKey, today]
  );

  const ceremoniesByDay = useMemo(() => {
    const pool = settings.personnelPool ?? [];
    const raw = new Map<
      string,
      Array<{ docId: string; name: string; ceremony: ReturnType<typeof buildCeremoniesForFall>[number] }>
    >();
    for (const s of sterbefaelle) {
      const name = s.verstorbenerName ?? s.sterbefallId ?? s.id;
      for (const ceremony of buildCeremoniesForFall(s, today)) {
        if (!ceremony.dayKey || !dayKeys.includes(ceremony.dayKey)) continue;
        const list = raw.get(ceremony.dayKey) ?? [];
        list.push({ docId: s.id, name, ceremony });
        raw.set(ceremony.dayKey, list);
      }
    }
    const map = new Map<string, ReturnType<typeof enrichPlanningCeremonies>>();
    for (const [dayKey, list] of raw) {
      map.set(dayKey, enrichPlanningCeremonies(list, bookings, pool));
    }
    return map;
  }, [sterbefaelle, today, dayKeys, bookings, settings.personnelPool]);

  const recentEvents = useMemo(() => (plan.events ?? []).slice(0, 6), [plan.events]);

  const clearDrag = useCallback(() => {
    setDrag(null);
    setDropTarget(null);
  }, []);

  const openCeremonyBooking = useCallback(
    (c: {
      docId: string;
      name: string;
      ceremony: ReturnType<typeof buildCeremoniesForFall>[number];
    }) => {
      const fall = sterbefaelle.find((s) => s.id === c.docId);
      if (!fall || !c.ceremony.dayKey) return;
      setBookingError(null);
      setBookingEntry(wallEntryFromPlanningCeremony(fall, c.ceremony, c.name));
    },
    [sterbefaelle, setBookingError]
  );

  const openSchedule = useCallback(
    (dayKey: string, kuehlraumId: string) => {
      const kr = settings.eigeneKuehlraeume.find((k) => k.id === kuehlraumId);
      if (!kr || !drag) {
        clearDrag();
        return;
      }

      if (drag.kind === 'source') {
        const existing = drag.item.existingCardId
          ? cards.find((c) => c.id === drag.item.existingCardId)
          : null;
        setScheduleDraft(
          buildScheduleDraftFromSterbeort({
            item: drag.item,
            dayKey,
            kuehlraum: kr,
            existingCard: existing,
          })
        );
        clearDrag();
        return;
      }

      if (drag.kind === 'occupant') {
        const fromKr = settings.eigeneKuehlraeume.find((k) => k.id === drag.fromKuehlraumId);
        if (!fromKr) {
          clearDrag();
          return;
        }
        const fall = sterbefaelle.find((s) => s.id === drag.occupant.docId);
        const sameKr = drag.fromKuehlraumId === kuehlraumId;
        setScheduleDraft(
          buildScheduleDraftFromOccupant({
            occupant: drag.occupant,
            fromKuehlraum: fromKr,
            dayKey,
            toKuehlraum: sameKr ? null : kr,
            endziel: fall?.endziel,
          })
        );
        clearDrag();
        return;
      }

      setScheduleDraft(
        buildScheduleDraftFromCard({
          card: drag.card,
          dayKey,
          kuehlraum: kr,
          richtung:
            drag.card.kuehlraumId && drag.card.kuehlraumId !== kuehlraumId
              ? 'umzug'
              : 'ankunft',
        })
      );
      clearDrag();
    },
    [settings.eigeneKuehlraeume, drag, cards, clearDrag, sterbefaelle]
  );

  const openAddLeg = useCallback(
    (card: PlanningCard) => {
      const fromId =
        card.kuehlraumId ??
        card.fromKuehlraumId ??
        settings.eigeneKuehlraeume[0]?.id;
      const kr = settings.eigeneKuehlraeume.find((k) => k.id === fromId);
      if (!kr) return;
      const dayKey = focusDayKey || card.plannedDayKey || calendarDay;
      setScheduleDraft(
        buildScheduleDraftFromCard({
          card,
          dayKey,
          kuehlraum: kr,
          createNewLeg: true,
          richtung: 'abgang',
        })
      );
    },
    [settings.eigeneKuehlraeume, focusDayKey, calendarDay]
  );

  const handleDropOnDay = useCallback(
    (dayKey: string) => {
      if (!drag || saving) {
        clearDrag();
        return;
      }
      setFocusDayKey(dayKey);

      if (drag.kind === 'source') {
        const krId =
          drag.item.suggestedKuehlraumId ?? settings.eigeneKuehlraeume[0]?.id;
        if (!krId) {
          clearDrag();
          return;
        }
        openSchedule(dayKey, krId);
        return;
      }

      if (drag.kind === 'occupant') {
        openSchedule(dayKey, drag.fromKuehlraumId);
        return;
      }

      if (drag.card.targetsEigenerKr || drag.card.leavesEigenerKr) {
        const krId =
          drag.card.kuehlraumId ??
          drag.card.fromKuehlraumId ??
          settings.eigeneKuehlraeume[0]?.id;
        if (krId) {
          openSchedule(dayKey, krId);
          return;
        }
      }

      // Nicht-KR-Überführung: nur Tag verschieben
      const card = drag.card;
      const order = nextOrderInLane(cards, dayKey);
      const hadPlan = Boolean(plan.assignments[card.id]);
      const nextAssignments = moveCardAssignment(plan.assignments, card, dayKey, order);
      clearDrag();
      setFlashId(card.id);
      void savePlan({
        assignments: nextAssignments,
        publish: {
          type: hadPlan ? 'ueberfuehrung_umgeplant' : 'ueberfuehrung_geplant',
          docId: card.docId,
          sterbefallId: card.sterbefallId,
          name: card.name,
          vonOrt: card.vonOrt,
          nachOrt: card.nachOrt,
          assignmentId: card.id,
          plannedDayKey: dayKey,
          plannedZeit: card.plannedZeit,
        },
      });
    },
    [
      drag,
      saving,
      clearDrag,
      settings.eigeneKuehlraeume,
      openSchedule,
      cards,
      plan.assignments,
      savePlan,
    ]
  );

  const handleDropOnKuehlraum = useCallback(
    (kuehlraumId: string) => {
      if (!drag || saving) {
        clearDrag();
        return;
      }
      openSchedule(focusDayKey || calendarDay, kuehlraumId);
    },
    [drag, saving, clearDrag, openSchedule, focusDayKey, calendarDay]
  );

  const confirmSchedule = useCallback(
    async (draft: ScheduleDraft) => {
      const existing =
        !draft.createNewLeg && draft.cardId
          ? cards.find((c) => c.id === draft.cardId)
          : null;
      const order = nextOrderInLane(cards, draft.dayKey);
      const result = scheduleToKuehlraum(plan.assignments, draft, order, existing);
      const fall = sterbefaelle.find((s) => s.id === draft.docId);
      setScheduleDraft(null);
      setFocusDayKey(draft.dayKey);
      setFlashId(result.assignment.id);
      window.setTimeout(
        () => setFlashId((id) => (id === result.assignment.id ? null : id)),
        800
      );
      try {
        await savePlan({
          assignments: result.assignments,
          publish: {
            type: result.eventType,
            docId: draft.docId,
            sterbefallId: draft.sterbefallId || fall?.sterbefallId || fall?.id,
            name: draft.name,
            vonOrt: draft.vonOrt,
            nachOrt: draft.nachOrt,
            kuehlraumId: draft.kuehlraumId,
            assignmentId: result.assignment.id,
            plannedDayKey: draft.dayKey,
            plannedZeit: draft.zeit,
          },
        });
      } catch {
        /* hook */
      }
    },
    [cards, plan.assignments, savePlan, sterbefaelle]
  );

  const resetCard = useCallback(
    async (card: PlanningCard) => {
      if (!card.hasManualPlan || saving) return;
      const result = undoOrRemoveAssignment(plan.assignments, card.id);
      try {
        if (result.mode === 'restored' && result.restored) {
          await savePlan({
            assignments: result.assignments,
            publish: {
              type: 'ueberfuehrung_umgeplant',
              docId: card.docId,
              sterbefallId: card.sterbefallId,
              name: card.name,
              vonOrt: result.restored.vonOrt ?? card.vonOrt,
              nachOrt: result.restored.nachOrt ?? card.nachOrt,
              kuehlraumId: result.restored.plannedKuehlraumId ?? undefined,
              assignmentId: card.id,
              plannedDayKey: result.restored.plannedDayKey,
              plannedZeit: result.restored.plannedZeit,
            },
          });
        } else {
          await savePlan({
            assignments: result.assignments,
            publish: {
              type: 'ueberfuehrung_entfernt',
              docId: card.docId,
              sterbefallId: card.sterbefallId,
              name: card.name,
              vonOrt: card.vonOrt,
              nachOrt: card.nachOrt,
              kuehlraumId: card.kuehlraumId ?? undefined,
              assignmentId: card.id,
              plannedDayKey: card.plannedDayKey,
              plannedZeit: card.plannedZeit,
            },
          });
        }
      } catch {
        /* handled */
      }
    },
    [plan.assignments, savePlan, saving]
  );

  const loading = casesLoading || planLoading;
  const error = casesError || planError;
  const draggingId =
    drag?.kind === 'card'
      ? drag.card.id
      : drag?.kind === 'source'
        ? drag.item.docId
        : null;
  const draggingOccupantId = drag?.kind === 'occupant' ? drag.occupant.docId : null;

  return (
    <div className="plan-page plan-page--board plan-page--compact">
      <header className="plan-hero plan-hero--compact">
        <div>
          <h1>Planung</h1>
        </div>
        <div className="plan-hero-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setAbsenceOpen(true)}
          >
            Abwesenheiten
          </button>
          <Link to="/disposition?tab=ueberfuehrungen" className="btn btn-ghost">
            Listen
          </Link>
          <LiveDataBar />
        </div>
      </header>

      {!firebaseConfigured && (
        <p className="board-inline-error" role="alert">
          Firebase ist nicht konfiguriert.
        </p>
      )}
      {(error || bookingError) && (
        <p className="board-inline-error" role="alert">
          {error || bookingError}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setError(null);
              setBookingError(null);
            }}
          >
            Schließen
          </button>
        </p>
      )}

      <div className="plan-toolbar plan-toolbar--compact">
        <div className="plan-toolbar-nav">
          <button type="button" className="btn btn-ghost" onClick={() => setRangeStart((d) => addDays(d, -7))}>
            ←
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setRangeStart(startOfWeekMonday(today));
              setFocusDayKey(calendarDay);
            }}
          >
            Diese Woche
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setRangeStart((d) => addDays(d, 7))}>
            →
          </button>
          <span className="plan-toolbar-range">
            {formatDayLabelDe(dayKeys[0])} – {formatDayLabelDe(dayKeys[dayKeys.length - 1])}
          </span>
          {(saving || bookingSaving) && <span className="plan-toolbar-saving">Speichert…</span>}
        </div>
        <label className="plan-toolbar-search">
          <span className="sr-only">Suchen</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, ID, Ort…"
          />
        </label>
      </div>

      {loading ? (
        <p className="plan-loading">Lade Planung…</p>
      ) : (
        <>
          <div className="plan-board" role="region" aria-label="Planungs-Canvas">
            <PlanningLocationRail
              groups={locationGroups}
              draggingId={draggingId}
              onDragStart={(item) => setDrag({ kind: 'source', item })}
              onDragEnd={clearDrag}
            />

            <div className="plan-center">
              <div className="plan-center-scroll">
                {dayKeys.map((dayKey) => {
                  const dayCards = cardsForLane(filteredCards, dayKey);
                  const dayCaps = capacities.filter((c) => c.dayKey === dayKey);
                  const dayCeremonies = ceremoniesByDay.get(dayKey) ?? [];
                  return (
                    <div
                      key={dayKey}
                      className={`plan-center-day-wrap${
                        flashId && dayCards.some((c) => c.id === flashId) ? ' has-flash' : ''
                      }${focusDayKey === dayKey ? ' is-focus' : ''}`}
                      onClick={() => setFocusDayKey(dayKey)}
                    >
                      <PlanningCenterDay
                        dayKey={dayKey}
                        title={formatDayLabelDe(dayKey)}
                        isToday={dayKey === calendarDay}
                        transfers={dayCards}
                        ceremonies={dayCeremonies}
                        capacities={dayCaps}
                        isDropTarget={dropTarget === `day:${dayKey}`}
                        draggingId={draggingId}
                        onDragOver={() => setDropTarget(`day:${dayKey}`)}
                        onDragLeave={() =>
                          setDropTarget((t) => (t === `day:${dayKey}` ? null : t))
                        }
                        onDrop={() => handleDropOnDay(dayKey)}
                        onCardDragStart={(card) => setDrag({ kind: 'card', card })}
                        onCardDragEnd={clearDrag}
                        onResetCard={(card) => void resetCard(card)}
                        onCeremonyClick={(c) => openCeremonyBooking(c)}
                        onAddLeg={(card) => openAddLeg(card)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <PlanningKuehlraumRail
              rails={krRails}
              dropTargetId={dropTarget?.startsWith('kr:') ? dropTarget.slice(3) : null}
              draggingOccupantId={draggingOccupantId}
              onDragOver={(id) => setDropTarget(`kr:${id}`)}
              onDragLeave={(id) =>
                setDropTarget((t) => (t === `kr:${id}` ? null : t))
              }
              onDrop={handleDropOnKuehlraum}
              onOccupantDragStart={(occupant, fromKuehlraumId) =>
                setDrag({ kind: 'occupant', occupant, fromKuehlraumId })
              }
              onOccupantDragEnd={clearDrag}
            />
          </div>

          {recentEvents.length > 0 && (
            <section className="plan-event-feed" aria-label="Planungs-Events">
              <header>
                <h2>Weitergegebene Events</h2>
                <p>Geplante Überführungen für Disposition & Monitoring</p>
              </header>
              <ul>
                {recentEvents.map((ev) => (
                  <li key={ev.id} className={`plan-event plan-event--${ev.type}`}>
                    <span className="plan-event-type">
                      {ev.type === 'ueberfuehrung_geplant'
                        ? 'Geplant'
                        : ev.type === 'ueberfuehrung_umgeplant'
                          ? 'Umgeplant'
                          : 'Entfernt'}
                    </span>
                    <strong>{ev.name ?? ev.sterbefallId ?? ev.docId}</strong>
                    <span className="plan-event-route">
                      {(ev.vonOrt ?? '—') + ' → ' + (ev.nachOrt ?? '—')}
                    </span>
                    <time>
                      {ev.plannedDayKey
                        ? formatTerminDisplay(ev.plannedDayKey, ev.plannedZeit)
                        : 'ohne Tag'}
                    </time>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <PlanningScheduleDialog
        draft={scheduleDraft}
        kuehlraeume={settings.eigeneKuehlraeume}
        pending={saving}
        error={planError}
        onClose={() => setScheduleDraft(null)}
        onConfirm={(d) => void confirmSchedule(d)}
      />

      {bookingEntry && (
        <PersonnelBookingDialog
          entry={bookingEntry}
          sterbefall={sterbefaelle.find((s) => s.id === bookingEntry.docId) ?? null}
          personnelPool={settings.personnelPool ?? []}
          allBookings={bookings}
          absences={absences}
          existing={bookings[bookingEntry.id] ?? null}
          pending={bookingSaving}
          markerPending={markerPending}
          error={bookingError}
          onClose={() => {
            if (!bookingSaving && !markerPending) setBookingEntry(null);
          }}
          onMarkerOverrideChange={async (marker: BestattungsMarker | null) => {
            setMarkerPending(true);
            try {
              await setSterbefallBestattungsMarkerOverride(bookingEntry.docId, marker);
            } finally {
              setMarkerPending(false);
            }
          }}
          onSave={(booking) => {
            void (async () => {
              try {
                await saveBooking(booking);
                setBookingEntry(null);
              } catch {
                /* Fehler im Hook */
              }
            })();
          }}
          onClear={() => {
            void (async () => {
              try {
                await clearBooking(bookingEntry.id);
                setBookingEntry(null);
              } catch {
                /* Fehler im Hook */
              }
            })();
          }}
        />
      )}

      <PersonnelAbsenceDialog
        open={absenceOpen}
        dayKeys={dayKeys}
        personnelPool={settings.personnelPool ?? []}
        absences={absences}
        pending={bookingSaving}
        error={bookingError}
        onClose={() => {
          if (!bookingSaving) setAbsenceOpen(false);
        }}
        onSave={async (absence) => {
          await saveAbsence(absence);
        }}
        onDelete={async (id) => {
          await clearAbsence(id);
        }}
      />
    </div>
  );
}
