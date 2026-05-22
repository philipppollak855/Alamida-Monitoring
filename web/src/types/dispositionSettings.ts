export interface EigenerKuehlraumConfig {
  id: string;
  label: string;
  /** Anzeige in Alamida, z. B. „Kühlr. Grafenbach“ */
  alamidaName?: string;
  /** Erkennung in Ortsnamen (Kleinbuchstaben, enthält) */
  matchKeywords: string[];
  plaetze: number;
}

/** Anzeigedauer je Wandmonitor-Tab vor dem automatischen Wechsel (Sekunden). */
export interface WallTabWechselSekunden {
  kuehlraum: number;
  extern: number;
  kalender: number;
  abholungen: number;
  offen: number;
}

export interface DispositionSettings {
  kremationKeywords: string[];
  krankenhausPrefixe: string[];
  krankenhausKeywords: string[];
  eigeneKuehlraeume: EigenerKuehlraumConfig[];
  /** Wandmonitor: Sekunden pro Tab bis zum nächsten Übergang */
  wallTabWechselSekunden?: WallTabWechselSekunden;
  updatedAt?: { seconds: number };
  /** Änderungszähler für Agent-Reload */
  settingsVersion?: number;
}
