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
  /** Externe, die die Einbuchung bereits bestätigt haben. */
  confirmedPersonIds?: string[];
  note?: string;
  updatedAtMs?: number;
};

/** Abwesenheit einer Pool-Person (inklusive Tage). */
export type PersonnelAbsence = {
  id: string;
  personId: string;
  fromDayKey: string;
  toDayKey: string;
  /** HH:mm — Abwesenheitsbeginn am Von-Tag (leer = ganzer Tag). */
  fromTime?: string;
  /** HH:mm — Abwesenheitsende am Bis-Tag (leer = ganzer Tag). */
  toTime?: string;
  note?: string;
  updatedAtMs?: number;
};

/** Zeitfenster, in dem eine Person trotz Bereitschaft nicht erreichbar ist. */
export type PersonnelStandbyExclusion = {
  id: string;
  personId: string;
  dayKey: string;
  fromTime: string;
  toTime: string;
};

/** Bereitschaft über einen Tag oder eine Spanne (Fr/Sa/So/Feiertag). */
export type PersonnelStandby = {
  id: string;
  fromDayKey: string;
  toDayKey: string;
  personIds: string[];
  exclusions?: PersonnelStandbyExclusion[];
  note?: string;
  updatedAtMs?: number;
};

export type PersonnelBookingDocument = {
  bookings: Record<string, PersonnelBooking>;
  absences?: Record<string, PersonnelAbsence>;
  standbys?: Record<string, PersonnelStandby>;
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

