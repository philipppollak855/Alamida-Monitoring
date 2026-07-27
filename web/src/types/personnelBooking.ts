import type { BestattungsMarker } from '../board/feierterminLogic';
import type { CalendarTerminArt } from '../board/wallCalendar';

export type PersonnelBooking = {
  /** = WallCalendarEntry.id */
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

export type PersonnelBookingDocument = {
  bookings: Record<string, PersonnelBooking>;
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
