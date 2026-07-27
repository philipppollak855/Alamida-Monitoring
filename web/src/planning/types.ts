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

export type FreigabeState = 'offen' | 'geplant' | 'frei';

export type CeremonyKind =
  | 'kremation'
  | 'beisetzung'
  | 'trauerfeier'
  | 'verabschiedung';

export type CeremonyInfo = {
  kind: CeremonyKind;
  datum: string;
  dayKey: string | null;
  zeit?: string;
  ort?: string;
  label: string;
  relativeLabel?: string;
  bestattungsMarker?: 'S' | 'U';
};

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
  sourceDayKey: string | null;
  plannedDayKey: string | null;
  status: string;
  erledigt?: boolean;
  istAbholungVomSterbeort?: boolean;
  targetsEigenerKr: boolean;
  leavesEigenerKr: boolean;
  kuehlraumId: string | null;
  order: number;
  hasManualPlan: boolean;
  source: 'alamida' | 'canvas';
  amSterbeort?: boolean;
  freigabeState?: FreigabeState;
  freigabeDatum?: string;
  ceremonies?: CeremonyInfo[];
  endzielTyp?: string;
  endziel?: string;
};

/** Fall in der linken Ort-Schiene. */
export type SterbeortPoolItem = {
  docId: string;
  sterbefallId: string;
  name: string;
  vonOrt: string;
  existingCardId?: string;
  suggestedKuehlraumId: string | null;
  freigabeState: FreigabeState;
  freigabeDatum?: string;
  /** Inklusive Tage seit Freigabe; nur wenn bereits frei. */
  tageSeitFreigabe?: number | null;
  nextCeremony?: CeremonyInfo;
  endzielTyp?: string;
  endziel?: string;
};

export type LocationGroup = {
  key: string;
  label: string;
  items: SterbeortPoolItem[];
};

export type SlotFreeEvent = {
  docId: string;
  name: string;
  dayKey: string;
  zeit?: string | null;
  reason: 'kremation' | 'beisetzung' | 'ueberfuehrung';
  vonOrt: string;
  nachOrt: string;
};

export type KuehlraumOccupant = {
  docId: string;
  name: string;
  sterbefallId: string;
  platz?: string;
  freigabeState: FreigabeState;
  freigabeDatum?: string;
  /** Inklusive Tage seit Freigabe; nur wenn bereits frei. */
  tageSeitFreigabe?: number | null;
  nextCeremony?: CeremonyInfo;
  freesOnDayKey?: string | null;
  freesReason?: SlotFreeEvent['reason'];
};

export type KuehlraumRailState = {
  id: string;
  label: string;
  alamidaName?: string;
  plaetze: number;
  occupiedNow: number;
  plannedArrivals: number;
  plannedDepartures: number;
  free: number;
  overbooked: boolean;
  /** Einstellung: Freigabe-Tage-Marker bei Belegung zeigen. */
  zeigeTageSeitFreigabe?: boolean;
  occupants: KuehlraumOccupant[];
  slotFrees: SlotFreeEvent[];
};

export type KuehlraumDayCapacity = {
  dayKey: string;
  kuehlraumId: string;
  label: string;
  plaetze: number;
  baseOccupied: number;
  projectedOccupied: number;
  arrivals: number;
  departures: number;
  free: number;
  overbooked: boolean;
};

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

export type DayBoardColumn = {
  dayKey: string;
  label: string;
  isToday: boolean;
  transfers: PlanningCard[];
  ceremonies: Array<{
    docId: string;
    name: string;
    ceremony: CeremonyInfo;
  }>;
  capacityByKr: KuehlraumDayCapacity[];
};
