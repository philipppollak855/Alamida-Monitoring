import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LiveDataBar } from '../components/LiveDataBar';
import { PlanningDayColumn } from '../components/planning/PlanningDayColumn';
import { PlanningScheduleDialog } from '../components/planning/PlanningScheduleDialog';
import { PlanningSterbeortCard } from '../components/planning/PlanningSterbeortCard';
import {
  addDays,
  dayKeyFromDate,
  formatDayLabelDe,
  startOfWeekMonday,
} from '../board/dateUtils';
import { filterAktiveSterbefaelle } from '../board/historieLogic';
import { useCalendarDay } from '../hooks/useCalendarDay';
import { useSterbefaelle } from '../hooks/useSterbefaelle';
import { useTransferPlan } from '../hooks/useTransferPlan';
import { useDispositionSettings } from '../settings/SettingsProvider';
import {
  buildKuehlraumCapacities,
  buildPlanningCards,
  buildScheduleDraftFromCard,
  buildScheduleDraftFromSterbeort,
  buildSterbeortPool,
  cardsForLane,
  formatTerminDisplay,
  moveCardAssignment,
  nextOrderInLane,
  removeAssignment,
  scheduleToKuehlraum,
} from '../planning/transferPlanning';
import type {
  PlanningCard,
  ScheduleDraft,
  SterbeortPoolItem,
} from '../planning/types';
import { firebaseConfigured } from '../firebase';

const HORIZON_DAYS = 7;

type DragState =
  | { kind: 'card'; card: PlanningCard }
  | { kind: 'sterbeort'; item: SterbeortPoolItem }
  | null;

export function PlanningPage() {
  const calendarDay = useCalendarDay();
  const today = useMemo(() => {
    const [y, m, d] = calendarDay.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [calendarDay]);

  const [rangeStart, setRangeStart] = useState(() => startOfWeekMonday(new Date()));
  const { settings } = useDispositionSettings();
  const { items: sterbefaelleRaw, loading: casesLoading, error: casesError } = useSterbefaelle();
  const { plan, loading: planLoading, saving, error: planError, savePlan, setError } =
    useTransferPlan();

  const [drag, setDrag] = useState<DragState>(null);
  const [dropLane, setDropLane] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [flashId, setFlashId] = useState<string | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft | null>(null);

  const sterbefaelle = useMemo(
    () => filterAktiveSterbefaelle(sterbefaelleRaw),
    [sterbefaelleRaw]
  );

  const dayKeys = useMemo(
    () => Array.from({ length: HORIZON_DAYS }, (_, i) => dayKeyFromDate(addDays(rangeStart, i))),
    [rangeStart]
  );

  const cards = useMemo(
    () => buildPlanningCards(sterbefaelle, plan.assignments, settings),
    [sterbefaelle, plan.assignments, settings]
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
    () => buildKuehlraumCapacities(sterbefaelle, cards, settings, dayKeys),
    [sterbefaelle, cards, settings, dayKeys]
  );

  const dayKeySet = useMemo(() => new Set(dayKeys), [dayKeys]);

  const backlog = useMemo(() => {
    return filteredCards.filter(
      (c) => c.plannedDayKey == null || !dayKeySet.has(c.plannedDayKey)
    );
  }, [filteredCards, dayKeySet]);

  const sterbeortPool = useMemo(() => {
    const pool = buildSterbeortPool(sterbefaelle, cards, settings);
    const q = search.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sterbefallId.toLowerCase().includes(q) ||
        p.vonOrt.toLowerCase().includes(q)
    );
  }, [sterbefaelle, cards, settings, search]);

  const recentEvents = useMemo(() => (plan.events ?? []).slice(0, 8), [plan.events]);

  const goToday = useCallback(() => {
    setRangeStart(startOfWeekMonday(today));
  }, [today]);

  const shiftRange = useCallback((deltaDays: number) => {
    setRangeStart((prev) => addDays(prev, deltaDays));
  }, []);

  const clearDrag = useCallback(() => {
    setDrag(null);
    setDropLane(null);
  }, []);

  const openScheduleForDrop = useCallback(
    (dayKey: string, kuehlraumId: string) => {
      const kr = settings.eigeneKuehlraeume.find((k) => k.id === kuehlraumId);
      if (!kr || !drag) {
        clearDrag();
        return;
      }

      if (drag.kind === 'sterbeort') {
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

  const handleDropLane = useCallback(
    async (laneKey: string, kuehlraumId?: string) => {
      if (!drag || saving) {
        clearDrag();
        return;
      }

      if (laneKey === 'backlog') {
        if (drag.kind !== 'card') {
          clearDrag();
          return;
        }
        if (drag.card.plannedDayKey == null) {
          clearDrag();
          return;
        }
        const card = drag.card;
        const order = nextOrderInLane(cards, null);
        const nextAssignments = moveCardAssignment(plan.assignments, card, null, order);
        clearDrag();
        setFlashId(card.id);
        window.setTimeout(() => setFlashId((id) => (id === card.id ? null : id)), 700);
        try {
          await savePlan({
            assignments: nextAssignments,
            publish: {
              type: 'ueberfuehrung_umgeplant',
              docId: card.docId,
              sterbefallId: card.sterbefallId,
              name: card.name,
              vonOrt: card.vonOrt,
              nachOrt: card.nachOrt,
              kuehlraumId: card.kuehlraumId ?? undefined,
              plannedDayKey: null,
              plannedZeit: null,
            },
          });
        } catch {
          /* hook */
        }
        return;
      }

      if (kuehlraumId) {
        openScheduleForDrop(laneKey, kuehlraumId);
        return;
      }

      // Tages-Drop ohne KR: bestehende Karte nur umplanen (Tag), Sterbeort → Dialog mit Primär-KR
      if (drag.kind === 'sterbeort') {
        const krId =
          drag.item.suggestedKuehlraumId ?? settings.eigeneKuehlraeume[0]?.id;
        if (!krId) {
          clearDrag();
          return;
        }
        openScheduleForDrop(laneKey, krId);
        return;
      }

      if (drag.card.targetsEigenerKr && drag.card.kuehlraumId) {
        openScheduleForDrop(laneKey, drag.card.kuehlraumId);
        return;
      }

      const card = drag.card;
      const order = nextOrderInLane(cards, laneKey);
      const nextAssignments = moveCardAssignment(plan.assignments, card, laneKey, order);
      clearDrag();
      setFlashId(card.id);
      try {
        await savePlan({
          assignments: nextAssignments,
          publish: {
            type: 'ueberfuehrung_umgeplant',
            docId: card.docId,
            sterbefallId: card.sterbefallId,
            name: card.name,
            vonOrt: card.vonOrt,
            nachOrt: card.nachOrt,
            plannedDayKey: laneKey,
          },
        });
      } catch {
        /* hook */
      }
    },
    [
      drag,
      saving,
      clearDrag,
      cards,
      plan.assignments,
      savePlan,
      openScheduleForDrop,
      settings.eigeneKuehlraeume,
    ]
  );

  const confirmSchedule = useCallback(
    async (draft: ScheduleDraft) => {
      const existing = draft.cardId ? cards.find((c) => c.id === draft.cardId) : null;
      const order = nextOrderInLane(cards, draft.dayKey);
      const result = scheduleToKuehlraum(plan.assignments, draft, order, existing);
      setScheduleDraft(null);
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
            plannedDayKey: draft.dayKey,
            plannedZeit: draft.zeit,
          },
        });
      } catch {
        /* hook */
      }
    },
    [cards, plan.assignments, savePlan]
  );

  const resetCard = useCallback(
    async (card: PlanningCard) => {
      if (!card.hasManualPlan || saving) return;
      const next = removeAssignment(plan.assignments, card.id);
      try {
        await savePlan({
          assignments: next,
          publish: {
            type: 'ueberfuehrung_entfernt',
            docId: card.docId,
            sterbefallId: card.sterbefallId,
            name: card.name,
            vonOrt: card.vonOrt,
            nachOrt: card.nachOrt,
            kuehlraumId: card.kuehlraumId ?? undefined,
            plannedDayKey: card.plannedDayKey,
            plannedZeit: card.plannedZeit,
          },
        });
      } catch {
        /* handled */
      }
    },
    [plan.assignments, savePlan, saving]
  );

  const loading = casesLoading || planLoading;
  const error = casesError || planError;
  const draggingId =
    drag?.kind === 'card' ? drag.card.id : drag?.kind === 'sterbeort' ? drag.item.docId : null;

  return (
    <div className="plan-page">
      <header className="plan-hero">
        <div>
          <p className="plan-eyebrow">Disposition</p>
          <h1>Überführungsplanung</h1>
          <p className="plan-lead">
            Sterbefall vom Sterbeort auf einen Kühlraum-Tag ziehen, Termin eingeben — Überführung
            erscheint visuell, Kühlraum-Kapazität wird angepasst, Event wird weitergegeben.
          </p>
        </div>
        <div className="plan-hero-actions">
          <Link to="/disposition?tab=ueberfuehrungen" className="btn btn-ghost">
            Zur Listenansicht
          </Link>
          <LiveDataBar />
        </div>
      </header>

      {!firebaseConfigured && (
        <p className="board-inline-error" role="alert">
          Firebase ist nicht konfiguriert.
        </p>
      )}
      {error && (
        <p className="board-inline-error" role="alert">
          {error}
          <button type="button" className="btn btn-ghost" onClick={() => setError(null)}>
            Schließen
          </button>
        </p>
      )}

      <div className="plan-toolbar">
        <div className="plan-toolbar-nav">
          <button type="button" className="btn btn-ghost" onClick={() => shiftRange(-7)} aria-label="Vorherige Woche">
            ←
          </button>
          <button type="button" className="btn btn-ghost" onClick={goToday}>
            Diese Woche
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => shiftRange(7)} aria-label="Nächste Woche">
            →
          </button>
          <span className="plan-toolbar-range">
            {formatDayLabelDe(dayKeys[0])} – {formatDayLabelDe(dayKeys[dayKeys.length - 1])}
          </span>
          {saving && <span className="plan-toolbar-saving">Speichert…</span>}
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
          <div className="plan-canvas plan-canvas--v2" role="region" aria-label="Planungs-Canvas">
            <aside className="plan-sidebar">
              <section className="plan-column plan-column--sterbeort">
                <header className="plan-column-head">
                  <div>
                    <h2>Am Sterbeort</h2>
                    <p>Auf Kühlraum ziehen</p>
                  </div>
                  <span className="plan-column-count">{sterbeortPool.length}</span>
                </header>
                <div className="plan-column-cards">
                  {sterbeortPool.length === 0 ? (
                    <p className="plan-column-empty">Keine Fälle am Sterbeort/KH</p>
                  ) : (
                    sterbeortPool.map((item) => (
                      <PlanningSterbeortCard
                        key={item.docId}
                        item={item}
                        dragging={drag?.kind === 'sterbeort' && drag.item.docId === item.docId}
                        onDragStart={(it) => setDrag({ kind: 'sterbeort', item: it })}
                        onDragEnd={clearDrag}
                      />
                    ))
                  )}
                </div>
              </section>

              <PlanningDayColumn
                dayKey={null}
                title="Backlog"
                subtitle="Ohne Tag / außerhalb"
                cards={backlog}
                isDropTarget={dropLane === 'backlog'}
                dropTargetKey={dropLane}
                draggingId={draggingId}
                onDragOverLane={setDropLane}
                onDragLeaveLane={(key) => setDropLane((l) => (l === key ? null : l))}
                onDropLane={(key) => void handleDropLane(key)}
                onCardDragStart={(card) => setDrag({ kind: 'card', card })}
                onCardDragEnd={clearDrag}
                emptyHint="Karten ohne Tag"
              />
            </aside>

            <div className="plan-days-scroll">
              {dayKeys.map((dayKey) => {
                const dayCards = cardsForLane(filteredCards, dayKey);
                const dayCaps = capacities.filter((c) => c.dayKey === dayKey);
                const isToday = dayKey === calendarDay;
                return (
                  <div
                    key={dayKey}
                    className={`plan-day-wrap${isToday ? ' is-today' : ''}${
                      flashId && dayCards.some((c) => c.id === flashId) ? ' has-flash' : ''
                    }`}
                  >
                    <PlanningDayColumn
                      dayKey={dayKey}
                      title={formatDayLabelDe(dayKey)}
                      subtitle={isToday ? 'Heute' : undefined}
                      cards={dayCards}
                      capacities={dayCaps}
                      kuehlraeume={settings.eigeneKuehlraeume}
                      enableKuehlraumDrops
                      isDropTarget={!!dropLane?.startsWith(`${dayKey}::`)}
                      dropTargetKey={dropLane}
                      draggingId={draggingId}
                      onDragOverLane={setDropLane}
                      onDragLeaveLane={(key) => setDropLane((l) => (l === key ? null : l))}
                      onDropLane={(key, krId) => void handleDropLane(key, krId)}
                      onCardDragStart={(card) => setDrag({ kind: 'card', card })}
                      onCardDragEnd={clearDrag}
                      emptyHint="Sterbefall auf Kühlraum ziehen"
                    />
                    {dayCards.some((c) => c.hasManualPlan) && (
                      <div className="plan-day-reset">
                        {dayCards
                          .filter((c) => c.hasManualPlan)
                          .map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className="plan-reset-btn"
                              title="Manuelle Planung zurücksetzen"
                              onClick={() => void resetCard(c)}
                            >
                              {c.name.split(' ')[0]} ↺
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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
        pending={saving}
        error={planError}
        onClose={() => setScheduleDraft(null)}
        onConfirm={(d) => void confirmSchedule(d)}
      />
    </div>
  );
}
