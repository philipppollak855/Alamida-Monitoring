import type { CalendarTerminArt } from '../board/wallCalendar';

/** Manuell angelegter Zusatztermin (optional zu einem Sterbefall). */
export type ZusatzTerminArt = 'graben' | 'sonstiges';

export type ZusatzTermin = {
  id: string;
  /**
   * sterbefaelle Doc-ID — leer bei freiem „Sonstiges“-Termin ohne Fall.
   * Graben sollte einen Fall haben.
   */
  docId: string;
  sterbefallId: string;
  /** Anzeigename (Fallname oder eigene Bezeichnung). */
  name: string;
  art: ZusatzTerminArt;
  /** Anzeigetitel, z. B. „Graben für Begräbnis“ */
  title: string;
  /** yyyy-MM-dd */
  dayKey: string;
  /** HH:mm optional */
  zeit?: string;
  ort?: string;
  note?: string;
  updatedAtMs?: number;
};

export type ZusatzTermineDocument = {
  termine: Record<string, ZusatzTermin>;
  updatedAtMs?: number;
};

export const ZUSATZ_TERMIN_ART_LABELS: Record<ZusatzTerminArt, string> = {
  graben: 'Graben',
  sonstiges: 'Sonstiges',
};

/** Vorschläge beim Anlegen */
export const ZUSATZ_TERMIN_PRESETS: { art: ZusatzTerminArt; title: string }[] = [
  { art: 'graben', title: 'Graben für Begräbnis' },
  { art: 'graben', title: 'Graben vorbereiten' },
  { art: 'sonstiges', title: 'Sonstiger Termin' },
];

export function zusatzArtToCalendarArt(art: ZusatzTerminArt): CalendarTerminArt {
  return art === 'graben' ? 'graben' : 'sonstiges';
}

export function isZusatzTerminArt(v: unknown): v is ZusatzTerminArt {
  return v === 'graben' || v === 'sonstiges';
}

/** Sonstiges darf ohne Fall; Graben braucht einen Fall. */
export function zusatzTerminNeedsFall(art: ZusatzTerminArt): boolean {
  return art === 'graben';
}
