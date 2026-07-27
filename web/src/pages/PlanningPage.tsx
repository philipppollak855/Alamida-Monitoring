import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LiveDataBar } from '../components/LiveDataBar';
import { PlanningDayColumn } from '../components/planning/PlanningDayColumn';
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
  cardsForLane,
  moveCardAssignment,
  nextOrderInLane,
} from '../planning/transferPlanning';
import type { PlanningCard } from '../planning/types';
import { firebaseConfigured } from '../firebase';

const HORIZON_DAYS = 7;

export function PlanningPage() {
  const calendarDay = useCalendarDay();
  const today = useMemo(() => {
    const [y, m, d] = calendarDay.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [calendarDay]);

  const [rangeStart, setRangeStart] = useState(() => startOfWeekMonday(new Date()));
  const { settings } = useDispositionSettings();
  const { items: sterbefaelleRaw, loading: casesLoading, error: casesError } = useSterbefaelle();
  const { plan, loading: planLoading, saving, error: planError, saveAssignments, setError } =
    useTransferPlan();

  const [dragCard, setDragCard] = useState<PlanningCard | null>(null);
  const [dropLane, setDropLane] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [flashId, setFlashId] = useState<string | null>(null);

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

  const goToday = useCallback(() => {
    setRangeStart(startOfWeekMonday(today));
  }, [today]);

  const shiftRange = useCallback((deltaDays: number) => {
    setRangeStart((prev) => addDays(prev, deltaDays));
  }, []);

  const handleDrop = useCallback(
    async (toDayKey: string | null) => {
      if (!dragCard || saving) {
        setDropLane(null);
        return;
      }
      if (dragCard.plannedDayKey === toDayKey) {
        setDragCard(null);
        setDropLane(null);
        return;
      }

      const order = nextOrderInLane(cards, toDayKey);
      const nextAssignments = moveCardAssignment(plan.assignments, dragCard, toDayKey, order);
      const movedId = dragCard.id;

      setDragCard(null);
      setDropLane(null);
      setFlashId(movedId);
      window.setTimeout(() => setFlashId((id) => (id === movedId ? null : id)), 700);

      try {
        await saveAssignments(nextAssignments);
      } catch {
        /* error already in hook */
      }
    },
    [dragCard, saving, cards, plan.assignments, saveAssignments]
  );

  const resetCard = useCallback(
    async (card: PlanningCard) => {
      if (!card.hasManualPlan || saving) return;
      const next = { ...plan.assignments };
      delete next[card.id];
      try {
        await saveAssignments(next);
      } catch {
        /* handled */
      }
    },
    [plan.assignments, saveAssignments, saving]
  );

  const loading = casesLoading || planLoading;
  const error = casesError || planError;

  return (
    <div className="plan-page">
      <header className="plan-hero">
        <div>
          <p className="plan-eyebrow">Disposition</p>
          <h1>Überführungsplanung</h1>
          <p className="plan-lead">
            Sterbefälle per Drag & Drop auf Tage legen und Kühlraum-Kapazität über mehrere Tage
            steuern.
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
        <div className="plan-canvas" role="region" aria-label="Planungs-Canvas">
          <PlanningDayColumn
            dayKey={null}
            title="Backlog"
            subtitle="Ohne Tag oder außerhalb der Woche"
            cards={backlog}
            isDropTarget={dropLane === 'backlog'}
            draggingId={dragCard?.id ?? null}
            onDragOverLane={() => setDropLane('backlog')}
            onDragLeaveLane={() => setDropLane((l) => (l === 'backlog' ? null : l))}
            onDropLane={() => void handleDrop(null)}
            onCardDragStart={setDragCard}
            onCardDragEnd={() => {
              setDragCard(null);
              setDropLane(null);
            }}
            emptyHint="Karten hierher ziehen, um den Tag zu entfernen"
          />

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
                    isDropTarget={dropLane === dayKey}
                    draggingId={dragCard?.id ?? null}
                    onDragOverLane={() => setDropLane(dayKey)}
                    onDragLeaveLane={() => setDropLane((l) => (l === dayKey ? null : l))}
                    onDropLane={() => void handleDrop(dayKey)}
                    onCardDragStart={setDragCard}
                    onCardDragEnd={() => {
                      setDragCard(null);
                      setDropLane(null);
                    }}
                    emptyHint="Überführung hierher ziehen"
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
      )}
    </div>
  );
}
