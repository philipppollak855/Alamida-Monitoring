import { useCallback, useEffect, useState } from 'react';
import type { PlanAssignment, PlanDocument } from '../planning/types';
import {
  loadTransferPlan,
  saveTransferPlanAssignments,
  subscribeTransferPlan,
} from '../services/transferPlan';

export function useTransferPlan() {
  const [plan, setPlan] = useState<PlanDocument>({ assignments: {} });
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

  const saveAssignments = useCallback(async (assignments: Record<string, PlanAssignment>) => {
    setSaving(true);
    setError(null);
    setPlan((prev) => ({ ...prev, assignments, updatedAtMs: Date.now() }));
    try {
      await saveTransferPlanAssignments(assignments);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  return { plan, loading, saving, error, saveAssignments, setError };
}
