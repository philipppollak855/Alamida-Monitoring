export interface EigenerKuehlraumConfig {
  id: string;
  label: string;
  /** Anzeige in Alamida, z. B. „Kühlr. Grafenbach“ */
  alamidaName?: string;
  /** Erkennung in Ortsnamen (Kleinbuchstaben, enthält) */
  matchKeywords: string[];
  plaetze: number;
}

export interface DispositionSettings {
  kremationKeywords: string[];
  krankenhausPrefixe: string[];
  krankenhausKeywords: string[];
  eigeneKuehlraeume: EigenerKuehlraumConfig[];
  updatedAt?: { seconds: number };
  /** Änderungszähler für Agent-Reload */
  settingsVersion?: number;
}
