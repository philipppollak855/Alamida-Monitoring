import { useCallback, useEffect, useState } from 'react';
import type { ZusatzTermin, ZusatzTermineDocument } from '../types/zusatzTermin';
import {
  deleteZusatzTermin,
  loadZusatzTermine,
  saveZusatzTermin,
  subscribeZusatzTermine,
} from '../services/zusatzTermine';

export function useZusatzTermine() {
  const [doc, setDoc] = useState<ZusatzTermineDocument>({ termine: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let unsub: (() => void) | undefined;

    void (async () => {
      try {
        const initial = await loadZusatzTermine();
        if (alive) {
          setDoc(initial);
          setLoading(false);
        }
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : 'Zusatztermine nicht ladbar');
          setLoading(false);
        }
      }
    })();

    unsub = subscribeZusatzTermine(
      (next) => {
        if (!alive) return;
        setDoc(next);
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

  const saveTermin = useCallback(async (termin: ZusatzTermin) => {
    setSaving(true);
    setError(null);
    setDoc((prev) => ({
      ...prev,
      termine: { ...prev.termine, [termin.id]: termin },
      updatedAtMs: Date.now(),
    }));
    try {
      await saveZusatzTermin(termin);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  const clearTermin = useCallback(async (id: string) => {
    setSaving(true);
    setError(null);
    setDoc((prev) => {
      const termine = { ...prev.termine };
      delete termine[id];
      return { ...prev, termine, updatedAtMs: Date.now() };
    });
    try {
      await deleteZusatzTermin(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen');
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  return {
    termine: doc.termine,
    loading,
    saving,
    error,
    saveTermin,
    clearTermin,
    setError,
  };
}
