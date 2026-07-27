import { useCallback, useEffect, useState } from 'react';
import type {
  PersonnelAbsence,
  PersonnelBooking,
  PersonnelBookingDocument,
} from '../types/personnelBooking';
import {
  deletePersonnelAbsence,
  deletePersonnelBooking,
  loadPersonnelBookings,
  savePersonnelAbsence,
  savePersonnelBooking,
  subscribePersonnelBookings,
} from '../services/personnelBookings';

export function usePersonnelBookings() {
  const [doc, setDoc] = useState<PersonnelBookingDocument>({ bookings: {}, absences: {} });
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

  return {
    bookings: doc.bookings,
    absences: doc.absences ?? {},
    loading,
    saving,
    error,
    saveBooking,
    clearBooking,
    saveAbsence,
    clearAbsence,
    setError,
  };
}
