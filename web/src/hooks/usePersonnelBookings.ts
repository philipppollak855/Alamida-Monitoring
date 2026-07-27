import { useCallback, useEffect, useState } from 'react';
import type {
  PersonnelAbsence,
  PersonnelBooking,
  PersonnelBookingDocument,
  PersonnelStandby,
} from '../types/personnelBooking';
import {
  deletePersonnelAbsence,
  deletePersonnelBooking,
  deletePersonnelStandby,
  loadPersonnelBookings,
  savePersonnelAbsence,
  savePersonnelBooking,
  savePersonnelStandby,
  subscribePersonnelBookings,
} from '../services/personnelBookings';

export function usePersonnelBookings() {
  const [doc, setDoc] = useState<PersonnelBookingDocument>({
    bookings: {},
    absences: {},
    standbys: {},
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let unsub: (() => void) | undefined;

    void (async () => {
      try {
        const initial = await loadPersonnelBookings();
        if (alive) {
          setDoc(initial);
          setLoading(false);
        }
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : 'Personalplanung nicht ladbar');
          setLoading(false);
        }
      }
    })();

    unsub = subscribePersonnelBookings(
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

  const saveBooking = useCallback(async (booking: PersonnelBooking) => {
    setSaving(true);
    setError(null);
    setDoc((prev) => ({
      ...prev,
      bookings: { ...prev.bookings, [booking.id]: booking },
      updatedAtMs: Date.now(),
    }));
    try {
      await savePersonnelBooking(booking);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  const clearBooking = useCallback(async (id: string) => {
    setSaving(true);
    setError(null);
    setDoc((prev) => {
      const bookings = { ...prev.bookings };
      delete bookings[id];
      return { ...prev, bookings, updatedAtMs: Date.now() };
    });
    try {
      await deletePersonnelBooking(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen');
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  const saveAbsence = useCallback(async (absence: PersonnelAbsence) => {
    setSaving(true);
    setError(null);
    setDoc((prev) => ({
      ...prev,
      absences: { ...(prev.absences ?? {}), [absence.id]: absence },
      updatedAtMs: Date.now(),
    }));
    try {
      await savePersonnelAbsence(absence);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Abwesenheit speichern fehlgeschlagen');
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  const clearAbsence = useCallback(async (id: string) => {
    setSaving(true);
    setError(null);
    let rollback: PersonnelBookingDocument | null = null;
    setDoc((prev) => {
      rollback = prev;
      const absences = { ...(prev.absences ?? {}) };
      delete absences[id];
      return { ...prev, absences, updatedAtMs: Date.now() };
    });
    try {
      await deletePersonnelAbsence(id);
    } catch (e) {
      if (rollback) setDoc(rollback);
      setError(e instanceof Error ? e.message : 'Abwesenheit löschen fehlgeschlagen');
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  const saveStandby = useCallback(async (standby: PersonnelStandby) => {
    setSaving(true);
    setError(null);
    setDoc((prev) => ({
      ...prev,
      standbys: { ...(prev.standbys ?? {}), [standby.id]: standby },
      updatedAtMs: Date.now(),
    }));
    try {
      await savePersonnelStandby(standby);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bereitschaft speichern fehlgeschlagen');
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  const clearStandby = useCallback(async (id: string) => {
    setSaving(true);
    setError(null);
    let rollback: PersonnelBookingDocument | null = null;
    setDoc((prev) => {
      rollback = prev;
      const standbys = { ...(prev.standbys ?? {}) };
      delete standbys[id];
      return { ...prev, standbys, updatedAtMs: Date.now() };
    });
    try {
      await deletePersonnelStandby(id);
    } catch (e) {
      if (rollback) setDoc(rollback);
      setError(e instanceof Error ? e.message : 'Bereitschaft löschen fehlgeschlagen');
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  return {
    bookings: doc.bookings,
    absences: doc.absences ?? {},
    standbys: doc.standbys ?? {},
    loading,
    saving,
    error,
    saveBooking,
    clearBooking,
    saveAbsence,
    clearAbsence,
    saveStandby,
    clearStandby,
    setError,
  };
}
