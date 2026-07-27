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
  findBookingForPlanningTransfer,
  planningCeremonyPersonnelLine,
  wallEntryFromPlanningCeremony,
  wallEntryFromPlanningTransfer,
} from '../planning/planningPersonnel';
import {
  assignmentSnapshotPayload,
  attachTransferToCeremony,
  buildCeremoniesForFall,
  buildKuehlraumCapacities,
  buildKuehlraumRailStates,
  buildLocationGroups,
  buildPlanningCards,
  buildScheduleDraftFromCard,
  buildScheduleDraftFromSterbeort,
  buildSterbeortPool,
  canUndoPlanEvent,
  cardsForLane,
  clearCardToAbholort,
  formatTerminDisplay,
  moveCardAssignment,
  nextOrderInLane,
  snapshotFromAssignment,
  undoOrRemoveAssignment,
  undoPlanEvent,
  scheduleToKuehlraum,
} from '../planning/transferPlanning';
import type {
  CeremonyInfo,
  DispositionPlanEvent,
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
  const [eventsOpen, setEventsOpen] = useState(false);

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

  const personnelByCardId = useMemo(() => {
    const pool = settings.personnelPool ?? [];
    const out: Record<string, string | null> = {};
    for (const card of cards) {
      if (!card.plannedDayKey || card.attachedCeremony) {
        out[card.id] = null;
        continue;
      }
      const booking = findBookingForPlanningTransfer(bookings, card);
      out[card.id] = planningCeremonyPersonnelLine(booking, pool);
    }
    return out;
  }, [cards, bookings, settings.personnelPool]);

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

  const openTransferPersonnel = useCallback(
    (card: PlanningCard) => {
      const fall = sterbefaelle.find((s) => s.id === card.docId);
      if (!fall) return;
      const entry = wallEntryFromPlanningTransfer(fall, card);
      if (!entry) return;
      setBookingError(null);
      setBookingEntry(entry);
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

      setScheduleDraft(
        buildScheduleDraftFromCard({
          card: drag.card,
          dayKey,
          kuehlraum: kr,
        })
      );
      clearDrag();
    },
    [settings.eigeneKuehlraeume, drag, cards, clearDrag]
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

      if (drag.card.targetsEigenerKr) {
        const krId =
          drag.card.kuehlraumId ??
          settings.eigeneKuehlraeume[0]?.id;
        if (krId) {
          openSchedule(dayKey, krId);
          return;
        }
      }

      // Nicht-KR-Überführung: nur Tag verschieben
      const card = drag.card;
      const order = nextOrderInLane(cards, dayKey);
      const prev = plan.assignments[card.id];
      const nextAssignments = moveCardAssignment(plan.assignments, card, dayKey, order, {
        attachedCeremony: null,
      });
      const assignment = nextAssignments[card.id];
      clearDrag();
      setFlashId(card.id);
      void savePlan({
        assignments: nextAssignments,
        publish: {
          type: prev ? 'ueberfuehrung_umgeplant' : 'ueberfuehrung_geplant',
          docId: card.docId,
          sterbefallId: card.sterbefallId,
          name: card.name,
          vonOrt: card.vonOrt,
          nachOrt: card.nachOrt,
          assignmentId: card.id,
          plannedDayKey: dayKey,
          plannedZeit: card.plannedZeit,
          previousSnapshot: prev ? snapshotFromAssignment(prev) : null,
          snapshot: assignment ? assignmentSnapshotPayload(assignment) : null,
        },
      });
    },
    [drag, saving, clearDrag, settings.eigeneKuehlraeume, openSchedule, cards, plan.assignments, savePlan]
  );

  const handleDropOnCeremony = useCallback(
    (target: { docId: string; ceremony: CeremonyInfo }) => {
      if (!drag || drag.kind !== 'card' || saving) {
        clearDrag();
        return;
      }
      const card = drag.card;
      if (card.docId !== target.docId || !target.ceremony.dayKey) {
        // Anderer Fall / kein Tag → normaler Tages-Drop
        handleDropOnDay(target.ceremony.dayKey ?? focusDayKey);
        return;
      }
      const order = nextOrderInLane(cards, target.ceremony.dayKey);
      const prev = plan.assignments[card.id];
      const result = attachTransferToCeremony(
        plan.assignments,
        card,
        target.ceremony,
        order
      );
      clearDrag();
      if (!result) {
        handleDropOnDay(target.ceremony.dayKey);
        return;
      }
      setFocusDayKey(target.ceremony.dayKey);
      setFlashId(result.assignment.id);
      void savePlan({
        assignments: result.assignments,
        publish: {
          type: result.eventType,
          docId: card.docId,
          sterbefallId: card.sterbefallId,
          name: card.name,
          vonOrt: card.vonOrt,
          nachOrt: card.nachOrt,
          kuehlraumId: card.kuehlraumId ?? undefined,
          assignmentId: result.assignment.id,
          plannedDayKey: result.assignment.plannedDayKey,
          plannedZeit: result.assignment.plannedZeit,
          previousSnapshot: prev ? snapshotFromAssignment(prev) : null,
          snapshot: assignmentSnapshotPayload(result.assignment),
        },
      });
    },
    [
      drag,
      saving,
      clearDrag,
      cards,
      plan.assignments,
      savePlan,
      handleDropOnDay,
      focusDayKey,
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
      const existing = draft.cardId ? cards.find((c) => c.id === draft.cardId) : null;
      const order = nextOrderInLane(cards, draft.dayKey);
      const prev = existing ? plan.assignments[existing.id] : undefined;
      const result = scheduleToKuehlraum(plan.assignments, draft, order, existing);
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
            sterbefallId: existing?.sterbefallId,
            name: draft.name,
            vonOrt: draft.vonOrt,
            nachOrt: draft.nachOrt,
            kuehlraumId: draft.kuehlraumId,
            assignmentId: result.assignment.id,
            plannedDayKey: draft.dayKey,
            plannedZeit: draft.zeit,
            previousSnapshot: prev ? snapshotFromAssignment(prev) : null,
            snapshot: assignmentSnapshotPayload(result.assignment),
          },
        });
      } catch {
        /* hook */
      }
    },
    [cards, plan.assignments, savePlan]
  );

  const returnCardToAbholort = useCallback(
    async (card: PlanningCard) => {
      if (saving) return;
      const prev = plan.assignments[card.id];
      const result = clearCardToAbholort(plan.assignments, card);
      clearDrag();
      try {
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
            previousSnapshot: prev
              ? snapshotFromAssignment(prev)
              : result.assignment.previous ?? null,
            snapshot: prev
              ? assignmentSnapshotPayload(prev)
              : card.plannedDayKey != null
                ? {
                    plannedDayKey: card.plannedDayKey,
                    plannedKuehlraumId: card.kuehlraumId,
                    plannedZeit: card.plannedZeit ?? null,
                    vonOrt: card.vonOrt,
                    nachOrt: card.nachOrt,
                    schrittTyp: card.schrittTyp,
                    order: card.order,
                    zeile: card.zeile,
                    source: card.source,
                    attachedCeremony: card.attachedCeremony ?? null,
                  }
                : null,
          },
        });
      } catch {
        /* handled */
      }
    },
    [plan.assignments, savePlan, saving, clearDrag]
  );

  const handleDropOnAbholort = useCallback(() => {
    if (!drag || drag.kind !== 'card' || saving) {
      clearDrag();
      return;
    }
    void returnCardToAbholort(drag.card);
  }, [drag, saving, clearDrag, returnCardToAbholort]);

  const resetCard = useCallback(
    async (card: PlanningCard) => {
      if (saving) return;
      // Mit Vorzustand: Umplanung rückgängig; sonst zurück zum Abholort
      if (card.canUndoUmplanung || plan.assignments[card.id]?.previous) {
        const result = undoOrRemoveAssignment(plan.assignments, card);
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
                previousSnapshot: result.previous
                  ? snapshotFromAssignment(result.previous)
                  : null,
                snapshot: assignmentSnapshotPayload(result.restored),
              },
            });
            return;
          }
        } catch {
          return;
        }
      }
      await returnCardToAbholort(card);
    },
    [plan.assignments, savePlan, saving, returnCardToAbholort]
  );

  const undoEvent = useCallback(
    async (ev: DispositionPlanEvent) => {
      if (saving || !canUndoPlanEvent(ev, plan.assignments)) return;
      const result = undoPlanEvent(plan.assignments, plan.events ?? [], ev.id);
      if (result.mode === 'noop') return;
      try {
        await savePlan({
          assignments: result.assignments,
          events: result.events,
        });
      } catch {
        /* handled */
      }
    },
    [plan.assignments, plan.events, savePlan, saving]
  );

  const loading = casesLoading || planLoading;
  const error = casesError || planError;
  const draggingId =
    drag?.kind === 'card' ? drag.card.id : drag?.kind === 'source' ? drag.item.docId : null;

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
              isDropTarget={dropTarget === 'abholort'}
              onDragStart={(item) => setDrag({ kind: 'source', item })}
              onDragEnd={clearDrag}
              onDragOver={() => setDropTarget('abholort')}
              onDragLeave={() =>
                setDropTarget((t) => (t === 'abholort' ? null : t))
              }
              onDrop={handleDropOnAbholort}
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
                        ceremonyDropKey={
                          dropTarget?.startsWith('ceremony:')
                            ? dropTarget.slice('ceremony:'.length)
                            : null
                        }
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
                        onCeremonyDragOver={(c) =>
                          setDropTarget(
                            `ceremony:${c.docId}|${c.ceremony.kind}|${c.ceremony.dayKey ?? ''}|${c.ceremony.zeit ?? ''}`
                          )
                        }
                        onCeremonyDragLeave={() =>
                          setDropTarget((t) => (t?.startsWith('ceremony:') ? null : t))
                        }
                        onDropOnCeremony={(c) => handleDropOnCeremony(c)}
                        onOpenPersonnel={openTransferPersonnel}
                        personnelByCardId={personnelByCardId}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <PlanningKuehlraumRail
              rails={krRails}
              dropTargetId={dropTarget?.startsWith('kr:') ? dropTarget.slice(3) : null}
              onDragOver={(id) => setDropTarget(`kr:${id}`)}
              onDragLeave={(id) =>
                setDropTarget((t) => (t === `kr:${id}` ? null : t))
              }
              onDrop={handleDropOnKuehlraum}
            />
          </div>

          {recentEvents.length > 0 && (
            <section
              className={`plan-event-feed${eventsOpen ? ' is-open' : ' is-collapsed'}`}
              aria-label="Planungs-Events"
            >
              <button
                type="button"
                className="plan-event-feed-toggle"
                aria-expanded={eventsOpen}
                onClick={() => setEventsOpen((o) => !o)}
              >
                <span className="plan-event-feed-toggle-main">
                  <strong>Weitergegebene Events</strong>
                  <span className="plan-event-feed-count">{recentEvents.length}</span>
                </span>
                <span className="plan-event-feed-chevron" aria-hidden>
                  {eventsOpen ? '▾' : '▸'}
                </span>
              </button>
              {eventsOpen && (
                <>
                  <p className="plan-event-feed-sub">
                    Geplante Überführungen für Disposition & Monitoring
                  </p>
                  <ul>
                    {recentEvents.map((ev) => {
                      const undoable = canUndoPlanEvent(ev, plan.assignments);
                      return (
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
                          {undoable && (
                            <button
                              type="button"
                              className="plan-event-undo"
                              title={
                                ev.type === 'ueberfuehrung_entfernt'
                                  ? 'Entfernen rückgängig'
                                  : ev.type === 'ueberfuehrung_umgeplant'
                                    ? 'Umplanung rückgängig'
                                    : 'Planung rückgängig'
                              }
                              disabled={saving}
                              onClick={() => void undoEvent(ev)}
                            >
                              ↺ Rückgängig
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </section>
          )}
        </>
      )}

      <PlanningScheduleDialog
        draft={scheduleDraft}
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
