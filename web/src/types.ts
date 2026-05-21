export interface Sterbefall {
  id: string;
  sterbefallId?: string;
  verstorbenerName?: string;
  kuehlraumId?: string;
  status?: string;
  workstationId?: string;
  updatedAt?: { seconds: number };
}

export interface Ueberfuehrung {
  id: string;
  sterbefallId?: string;
  vonOrt?: string;
  nachOrt?: string;
  abholungAm?: string;
  kuehlraumId?: string;
  aktuellerStandort?: string;
  workstationId?: string;
}

export interface MonitoringEvent {
  id: string;
  type?: string;
  sterbefallId?: string;
  kuehlraumId?: string;
  workstationId?: string;
  createdAt?: { seconds: number };
}
