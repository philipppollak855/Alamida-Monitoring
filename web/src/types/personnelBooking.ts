import type { BestattungsMarker } from '../board/feierterminLogic';
import type { CalendarTerminArt } from '../board/wallCalendar';

export type PersonnelBooking = {
  /** = WallCalendarEntry.id bzw. Planungs-Zeremonie-ID */
  id: string;
  docId: string;
  sterbefallId: string;
  dayKey: string;
  entryTitle: string;
  entryArts: CalendarTerminArt[];
  timeLabel: string;
  name: string;
  bestattungsMarker?: BestattungsMarker;
  arrangeurId: string | null;
  traegerIds: string[];
  traegerVonFamilie: boolean;
  /** Gewünschte Trägeranzahl (Firma); bei Familie irrelevant. */
  requiredTraegerCount: number;
  note?: string;
  updatedAtMs?: number;
};

/** Abwesenheit einer Pool-Person (inklusive Tage). */
export type PersonnelAbsence = {
  id: string;
  personId: string;
  fromDayKey: string;
  toDayKey: string;
  note?: string;
  updatedAtMs?: number;
};

export type PersonnelBookingDocument = {
  bookings: Record<string, PersonnelBooking>;
  absences?: Record<string, PersonnelAbsence>;
  updatedAtMs?: number;
};

export type PersonnelBookingValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  minTraeger: number;
  requiresArrangeur: boolean;
  isBegraebnis: boolean;
};

export type PersonUnavailableReason =
  | 'absent'
  | 'booked-arrangeur'
  | 'booked-traeger'
  | 'booked-overlap';

