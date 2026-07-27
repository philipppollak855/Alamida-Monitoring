import { useCallback, useEffect, useState } from 'react';
import type { DispositionPlanEvent, PlanAssignment, PlanDocument } from '../planning/types';
import {
  loadTransferPlan,
  publishDispositionPlanEvent,
  saveTransferPlan,
  subscribeTransferPlan,
} from '../services/transferPlan';

export function useTransferPlan() {
  const [plan, setPlan] = useState<PlanDocument>({ assignments: {}, events: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let unsub: (() => void) | undefined;

    void (async () => {
      try {
        const initial = await loadTransferPlan();
        if (alive) {
          setPlan(initial);
          setLoading(false);
        }
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : 'Plan konnte nicht geladen werden');
          setLoading(false);
        }
      }
    })();

    unsub = subscribeTransferPlan(
      (next) => {
        if (!alive) return;
        setPlan(next);
        setLoading(false);
        setError(null);
      },
      (err) => {
        if (!alive) return;
        setError(err.message);
      }
    );

    return () => {
      alive = false;
      unsub?.();
    };
  }, []);

  const savePlan = useCallback(
    async (next: {
      assignments: Record<string, PlanAssignment>;
      events?: DispositionPlanEvent[];
      publish?: Omit<DispositionPlanEvent, 'id' | 'createdAtMs'> & {
        id?: string;
        createdAtMs?: number;
      };
    }) => {
      setSaving(true);
      setError(null);

      let events = next.events ?? plan.events ?? [];
      if (next.publish) {
        const published = await publishDispositionPlanEvent(next.publish);
        events = [published, ...events].slice(0, 40);
      }

      const doc: PlanDocument = {
        assignments: next.assignments,
        events,
        updatedAtMs: Date.now(),
      };
      setPlan(doc);

      try {
        await saveTransferPlan(doc);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [plan.events]
  );

  const saveAssignments = useCallback(
    async (assignments: Record<string, PlanAssignment>) => {
      await savePlan({ assignments, events: plan.events ?? [] });
    },
    [plan.events, savePlan]
  );

  return { plan, loading, saving, error, savePlan, saveAssignments, setError };
}
