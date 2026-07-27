/** Persistierte Zuordnung einer Überführung auf dem Planungs-Canvas. */
export type PlanAssignment = {
  /** `${docId}:${zeile}` oder `${docId}:canvas:${kuehlraumId}` */
  id: string;
  docId: string;
  /** Alamida-Zeile, oder -1 bei Canvas-Neuplanung. */
  zeile: number;
  /** yyyy-MM-dd oder null = Backlog / unzugewiesen */
  plannedDayKey: string | null;
  /** Ziel-Kühlraum für Ressourcenplanung. */
  plannedKuehlraumId?: string | null;
  /** Optionale Uhrzeit HH:mm */
  plannedZeit?: string | null;
  vonOrt?: string | null;
  nachOrt?: string | null;
  schrittTyp?: string | null;
  /** Alamida-abgeleitet vs. manuell auf dem Canvas angelegt. */
  source?: 'alamida' | 'canvas';
  /** Manuelle Reihenfolge innerhalb des Tages. */
  order: number;
  updatedAtMs?: number;
};

export type DispositionPlanEvent = {
  id: string;
  type: 'ueberfuehrung_geplant' | 'ueberfuehrung_umgeplant' | 'ueberfuehrung_entfernt';
  docId: string;
  sterbefallId?: string;
  name?: string;
  vonOrt?: string;
  nachOrt?: string;
  kuehlraumId?: string;
  plannedDayKey?: string | null;
  plannedZeit?: string | null;
  createdAtMs: number;
};

export type PlanDocument = {
  assignments: Record<string, PlanAssignment>;
  events?: DispositionPlanEvent[];
  updatedAtMs?: number;
};

export type PlanningLaneId = 'backlog' | 'sterbeort' | string; // dayKey or dayKey::krId

export type PlanningCard = {
  id: string;
  docId: string;
  zeile: number;
  sterbefallId: string;
  name: string;
  schrittTyp: string;
  vonOrt: string;
  nachOrt: string;
  terminAm: string;
  plannedZeit?: string | null;
  /** Alamida-/Quell-Tag (yyyy-MM-dd), null wenn ohne Datum. */
  sourceDayKey: string | null;
  /** Effektiver Tag auf dem Canvas. */
  plannedDayKey: string | null;
  status: string;
  erledigt?: boolean;
  istAbholungVomSterbeort?: boolean;
  /** Ob Ziel ein eigener Kühlraum ist. */
  targetsEigenerKr: boolean;
  /** Ob Start ein eigener Kühlraum ist (Abgang). */
  leavesEigenerKr: boolean;
  /** Zugeordneter Kühlraum für Kapazität. */
  kuehlraumId: string | null;
  order: number;
  hasManualPlan: boolean;
  source: 'alamida' | 'canvas';
  /** Aktuell am Sterbeort/KH und für KR-Überführung planbar. */
  amSterbeort?: boolean;
};

/** Fall im Sterbeort-Pool (noch nicht als KR-Überführung auf dem Canvas terminiert). */
export type SterbeortPoolItem = {
  docId: string;
  sterbefallId: string;
  name: string;
  vonOrt: string;
  /** Bestehende offene Alamida-Zeile Richtung eigener KR, falls vorhanden. */
  existingCardId?: string;
  suggestedKuehlraumId: string | null;
};

export type KuehlraumDayCapacity = {
  dayKey: string;
  kuehlraumId: string;
  label: string;
  plaetze: number;
  /** Aktuelle physische Belegung zu Beginn des Horizonts. */
  baseOccupied: number;
  /** Prognose am Tagesende nach geplanten Zu-/Abgängen. */
  projectedOccupied: number;
  arrivals: number;
  departures: number;
  free: number;
  overbooked: boolean;
};

export type PlanningDragPayload =
  | { kind: 'card'; cardId: string }
  | { kind: 'sterbeort'; docId: string };

export type ScheduleDraft = {
  docId: string;
  cardId?: string;
  name: string;
  vonOrt: string;
  nachOrt: string;
  kuehlraumId: string;
  kuehlraumLabel: string;
  dayKey: string;
  zeit: string;
  schrittTyp: string;
  existingZeile?: number;
};
