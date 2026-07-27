export type KuehlraumWandTab = 'kuehlraum' | 'extern';

export type PersonnelRole = 'arrangeur' | 'traeger' | 'fahrer';

/** Person im Disposition-Personalpool (Arrangeur / Träger / Fahrer). */
export interface DispositionPerson {
  id: string;
  name: string;
  roles: PersonnelRole[];
  active?: boolean;
  /** Externe Person (z. B. Träger von außerhalb) — eigener Tab in der Einbuchung. */
  extern?: boolean;
}

export interface EigenerKuehlraumConfig {
  id: string;
  label: string;
  /** Anzeige in Alamida, z. B. „Kühlr. Grafenbach“ */
  alamidaName?: string;
  /** Erkennung in Ortsnamen (Kleinbuchstaben, enthält) */
  matchKeywords: string[];
  /** Externe Abholorte (UK, Senecura …) → Zuordnung zu diesem Kühlraum */
  externKeywords: string[];
  /** Wandmonitor: Tab „Kühlraum“ (Platzraster) oder „Extern“ (Kartenliste) */
  wandTab?: KuehlraumWandTab;
  plaetze: number;
  /** Planung: Tage seit Freigabe bei Belegung anzeigen (Freigabetag zählt mit). */
  zeigeTageSeitFreigabe?: boolean;
  /** Planung: Belegung auch in der linken Spalte („Aktuelle Orte“) anzeigen. */
  zeigeInLinkerPlanungsspalte?: boolean;
}

/** Anzeigedauer je Wandmonitor-Tab vor dem automatischen Wechsel (Sekunden). */
export interface WallTabWechselSekunden {
  kuehlraum: number;
  extern: number;
  kalender: number;
  abholungen: number;
  offen: number;
}

/** Aktiviert Tabs für den automatischen Rotationslauf am Wandmonitor. */
export interface WallTabRotationEnabled {
  kuehlraum: boolean;
  extern: boolean;
  kalender: boolean;
  abholungen: boolean;
  offen: boolean;
}

export interface DispositionSettings {
  kremationPrefixe: string[];
  kremationKeywords: string[];
  krankenhausPrefixe: string[];
  krankenhausKeywords: string[];
  /** Extern-Wand: Pflegeheim / Senecura … */
  pflegeheimPrefixe: string[];
  pflegeheimKeywords: string[];
  /** Extern-Wand: Bestattung / Bestatter … */
  bestattungPrefixe: string[];
  bestattungKeywords: string[];
  eigeneKuehlraeume: EigenerKuehlraumConfig[];
  /** Pool für Kalender-Personal-Einbuchung (Arrangeur / Träger / Fahrer). */
  personnelPool?: DispositionPerson[];
  /** Wandmonitor: Sekunden pro Tab bis zum nächsten Übergang */
  wallTabWechselSekunden?: WallTabWechselSekunden;
  /** Wandmonitor: welche Tabs in der Rotation angezeigt werden */
  wallTabRotationEnabled?: WallTabRotationEnabled;
  updatedAt?: { seconds: number };
  /** Änderungszähler für Agent-Reload */
  settingsVersion?: number;
}
