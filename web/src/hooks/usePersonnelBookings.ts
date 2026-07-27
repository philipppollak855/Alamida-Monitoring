import { useCallback, useEffect, useState } from 'react';
import type { PersonnelBooking, PersonnelBookingDocument } from '../types/personnelBooking';
import {
  deletePersonnelBooking,
  loadPersonnelBookings,
  savePersonnelBooking,
  subscribePersonnelBookings,
} from '../services/personnelBookings';

export function usePersonnelBookings() {
  const [doc, setDoc] = useState<PersonnelBookingDocument>({ bookings: {} });
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

  return {
    bookings: doc.bookings,
    loading,
    saving,
    error,
    saveBooking,
    clearBooking,
    setError,
  };
}
