/** Persistierte Zuordnung einer Überführung auf dem Planungs-Canvas. */
export type PlanAssignment = {
  /** `${docId}:${zeile}` */
  id: string;
  docId: string;
  zeile: number;
  /** yyyy-MM-dd oder null = Backlog / unzugewiesen */
  plannedDayKey: string | null;
  /** Ziel-Kühlraum für Ressourcenplanung (optional Override). */
  plannedKuehlraumId?: string | null;
  /** Manuelle Reihenfolge innerhalb des Tages. */
  order: number;
  updatedAtMs?: number;
};

export type PlanDocument = {
  assignments: Record<string, PlanAssignment>;
  updatedAtMs?: number;
};

export type PlanningLaneId = 'backlog' | string; // dayKey

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

export type PlanningDragPayload = {
  cardId: string;
  fromLane: PlanningLaneId;
};
