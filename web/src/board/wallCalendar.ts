import type { Sterbefall } from '../types';
import { schrittTypLabel } from '../types';
import {
  addDays,
  dayKeyFromDate,
  dayKeyFromDeDatum,
  extractDeDatum,
  extractZeitDe,
  formatDayLabelDe,
  formatZeitDe,
  parseDatumZeitDe,
  startOfWeekMonday,
} from './dateUtils';
import {
  beisetzungImAnschlussAmTrauerfeierTag,
  calendarBestattungsMarker,
  type BestattungsMarker,
  trauerfeier1AlsVerabschiedung,
} from './feierterminLogic';
import { filterSterbefaelleFuerKalender, sterbefallImAnschluss } from './historieLogic';

export type WallCalendarRange = 7 | 14 | 'month';

export type CalendarTerminArt =
  | 'aufnahme'
  | 'rosenkranz'
  | 'verabschiedung'
  | 'trauerfeier'
  | 'trauerfeier2'
  | 'beisetzung'
  | 'ueberfuehrung'
  | 'ueberfuehrung_kremation'
  | 'trauerblock'
  | 'graben'
  | 'sonstiges';

/** Farbgruppen im Kalender (Filter bleiben bei den sichtbaren Terminarten). */
export type CalendarColorGroup = 'fahrt' | 'kremation' | 'feier' | 'aufnahme' | 'zusatz';

export function calendarColorGroupFromArts(arts: readonly CalendarTerminArt[]): CalendarColorGroup {
  if (arts.some((a) => a === 'aufnahme')) return 'aufnahme';
  // Feier-/Begräbnis-Termin mit angehängter Überführung bleibt Feier-Farbe
  if (
    arts.some(
      (a) =>
        a === 'beisetzung' ||
        a === 'verabschiedung' ||
        a === 'trauerfeier' ||
        a === 'trauerfeier2' ||
        a === 'rosenkranz'
    )
  ) {
    return 'feier';
  }
  if (arts.some((a) => a === 'ueberfuehrung_kremation')) return 'kremation';
  if (arts.some((a) => a === 'ueberfuehrung')) return 'fahrt';
  if (arts.some((a) => a === 'graben' || a === 'sonstiges')) return 'zusatz';
  return 'feier';
}

function calendarArtFromSchritt(schrittTyp?: string): CalendarTerminArt {
  const typ = (schrittTyp ?? '').trim().toLowerCase();
  if (typ === 'kremation') return 'ueberfuehrung_kremation';
  return 'ueberfuehrung';
}

function artMatchesFilter(art: CalendarTerminArt, activeArts: ReadonlySet<CalendarTerminArt>): boolean {
  if (activeArts.has(art)) return true;
  if (art === 'ueberfuehrung_kremation' && activeArts.has('ueberfuehrung')) return true;
  return false;
}

export const ALL_CALENDAR_TERMIN_ARTEN: CalendarTerminArt[] = [
  'aufnahme',
  'rosenkranz',
  'verabschiedung',
  'trauerfeier',
  'trauerfeier2',
  'beisetzung',
  'ueberfuehrung',
  'trauerblock',
  'graben',
  'sonstiges',
];

export const CALENDAR_TERMIN_ART_LABELS: Record<CalendarTerminArt, string> = {
  aufnahme: 'Aufnahme',
  rosenkranz: 'Rosenkranz',
  verabschiedung: 'Verabschiedung',
  trauerfeier: 'Trauerfeier',
  trauerfeier2: 'Trauerfeier 2',
  beisetzung: 'Beisetzung',
  ueberfuehrung: 'Überführung',
  ueberfuehrung_kremation: 'Ins Krematorium',
  trauerblock: 'Trauerblock',
  graben: 'Graben',
  sonstiges: 'Sonstiges',
};

export function isCalendarFilterComplete(activeArts: ReadonlySet<CalendarTerminArt>): boolean {
  return ALL_CALENDAR_TERMIN_ARTEN.every((a) => activeArts.has(a));
}

export function isCalendarTerminArt(v: unknown): v is CalendarTerminArt {
  return typeof v === 'string' && ALL_CALENDAR_TERMIN_ARTEN.includes(v as CalendarTerminArt);
}

/** Mehrfachfilter: Eintrag sichtbar, wenn mindestens eine seiner Arten aktiv ist. */
export function filterEntriesByArts(
  entries: WallCalendarEntry[],
  activeArts: ReadonlySet<CalendarTerminArt>
): WallCalendarEntry[] {
  if (activeArts.size === 0) return [];
  if (isCalendarFilterComplete(activeArts)) return entries;
  return entries.filter((e) => e.arts.some((a) => artMatchesFilter(a, activeArts)));
}

interface AtomicTermin {
  key: string;
  art: CalendarTerminArt;
  label: string;
  dayKey: string;
  sortMs: number;
  zeit?: string;
  ort?: string;
  route?: string;
}

export interface WallCalendarEntry {
  id: string;
  docId: string;
  sterbefallId: string;
  dayKey: string;
  dayLabel: string;
  timeLabel: string;
  sortMs: number;
  name: string;
  title: string;
  subtitle: string;
  badges: string[];
  grouped: boolean;
  arts: CalendarTerminArt[];
  searchText: string;
  /** S = ohne Kremation, U = mit Kremation im Ablauf */
  bestattungsMarker?: BestattungsMarker;
  /** Manuell angelegter Zusatztermin (settings/zusatzTermine) */
  zusatzTerminId?: string;
  /**
   * Überführung ist dem Feier-/Begräbnis-/Retour-Termin zugehörig
   * (kein eigener Personalbedarf).
   */
  attachedTransfer?: boolean;
  /** Mehrere Fälle in einer kombinierten Kremationsfahrt (wie Planung). */
  kremationGroupId?: string;
  kremationMemberNames?: string[];
}

export interface WallCalendarDay {
  dayKey: string;
  dayLabel: string;
  weekdayShort: string;
  isToday: boolean;
  isWeekend: boolean;
  entries: WallCalendarEntry[];
}

function fallName(s: Sterbefall): string {
  return (
    s.verstorbenerName?.trim() ||
    [s.verstorbenerVorname, s.verstorbenerNachname].filter(Boolean).join(' ') ||
    s.sterbefallId ||
    s.id
  );
}

function pushAtomic(
  list: AtomicTermin[],
  s: Sterbefall,
  art: CalendarTerminArt,
  label: string,
  rawDatum?: string,
  rawZeit?: string,
  ort?: string,
  route?: string
) {
  const datum = extractDeDatum(rawDatum);
  if (!datum) return;
  const zeit = extractZeitDe(rawDatum, rawZeit);
  const dayKey = dayKeyFromDeDatum(datum);
  if (!dayKey) return;
  const sortMs = parseDatumZeitDe(datum, zeit) ?? parseDatumZeitDe(datum, undefined, true)!;
  list.push({
    key: `${s.id}:${art}:${dayKey}:${zeit ?? ''}`,
    art,
    label,
    dayKey,
    sortMs,
    zeit: zeit || undefined,
    ort: ort?.trim() || undefined,
    route: route?.trim() || undefined,
  });
}

function collectAtomics(s: Sterbefall): AtomicTermin[] {
  const atoms: AtomicTermin[] = [];
  const seen = new Set<string>();
  const name = fallName(s);

  const ueberfuehrungKey = (
    datum?: string,
    schrittTyp?: string,
    von?: string,
    nach?: string,
    ort?: string
  ): string | null => {
    const dayKey = dayKeyFromDeDatum(datum);
    if (!dayKey) return null;
    const route = `${(von ?? ort ?? '').trim().toLowerCase()}→${(nach ?? '').trim().toLowerCase()}`;
    const typ = (schrittTyp ?? 'ueberfuehrung').trim().toLowerCase();
    return `ueb:${dayKey}|${typ}|${route}`;
  };

  const add = (
    art: CalendarTerminArt,
    label: string,
    rawDatum?: string,
    rawZeit?: string,
    ort?: string,
    route?: string,
    dedupeKey?: string
  ) => {
    const datum = extractDeDatum(rawDatum);
    if (!datum) return;
    const zeit = extractZeitDe(rawDatum, rawZeit);
    const dayKey = dayKeyFromDeDatum(datum);
    if (!dayKey) return;
    const key =
      dedupeKey ??
      `${art}:${dayKey}:${zeit ?? ''}:${route ?? ''}:${ort ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    pushAtomic(atoms, s, art, label, rawDatum, rawZeit, ort, route);
  };
  const ortTf = s.trauerfeierort?.trim() || s.endziel?.trim() || undefined;
  const ortBeisetzung = s.endziel?.trim() || undefined;

  if (s.aufnahmedatum?.trim()) {
    add('aufnahme', 'Aufnahme', s.aufnahmedatum, s.aufnahmezeit, s.aufnahmeort);
  }

  if (s.rosenkranzdatum?.trim()) {
    add('rosenkranz', 'Rosenkranz', s.rosenkranzdatum, s.rosenkranzzeit, s.rosenkranzort);
  }

  if (s.trauerfeierdatum?.trim()) {
    const alsVerabschiedung = trauerfeier1AlsVerabschiedung(s);
    const label = alsVerabschiedung ? 'Verabschiedung' : 'Trauerfeier';
    const art: CalendarTerminArt = alsVerabschiedung ? 'verabschiedung' : 'trauerfeier';
    add(art, label, s.trauerfeierdatum, s.trauerfeierzeit, ortTf);
  }

  if (s.trauerfeier2datum?.trim()) {
    add('trauerfeier2', 'Trauerfeier 2', s.trauerfeier2datum, s.trauerfeier2zeit, s.trauerfeier2ort ?? ortTf);
  }

  const beisetzungsDatumNorm =
    extractDeDatum(s.beisetzungsdatum) ?? extractDeDatum(s.trauerfeierdatum) ?? undefined;

  if (beisetzungsDatumNorm) {
    if (beisetzungImAnschlussAmTrauerfeierTag(s)) {
      add('beisetzung', 'Beisetzung', beisetzungsDatumNorm, undefined, ortBeisetzung);
    } else {
      add('beisetzung', 'Beisetzung', s.beisetzungsdatum, s.beisetzungszeit, ortBeisetzung);
    }
  } else if (beisetzungImAnschlussAmTrauerfeierTag(s)) {
    add(
      'beisetzung',
      'Beisetzung',
      extractDeDatum(s.trauerfeierdatum) ?? s.trauerfeierdatum,
      undefined,
      ortBeisetzung
    );
  }

  for (const a of s.ausstehend ?? []) {
    const datum = a.terminAm ?? a.abholungAm;
    if (!datum?.trim()) continue;
    const von = a.vonOrt ?? '—';
    const nach = a.nachOrt ?? '—';
    const key = ueberfuehrungKey(datum, a.schrittTyp, von, nach);
    add(
      calendarArtFromSchritt(a.schrittTyp),
      schrittTypLabel(a.schrittTyp),
      datum,
      undefined,
      undefined,
      `${von} → ${nach}`,
      key ?? undefined
    );
  }

  for (const v of s.verlauf ?? []) {
    const datum = v.terminAm ?? v.abholungAm;
    if (!datum?.trim()) continue;
    const von = v.vonOrt ?? v.ort ?? '—';
    const nach = v.nachOrt ?? '—';
    const key = ueberfuehrungKey(datum, v.typ, von, nach, v.ort);
    if (!key || seen.has(key)) continue;
    add(
      calendarArtFromSchritt(v.typ),
      schrittTypLabel(v.typ),
      datum,
      undefined,
      v.ort,
      `${von} → ${nach}`,
      key
    );
  }

  void name;
  return atoms;
}

function buildSearchText(s: Sterbefall, parts: AtomicTermin[]): string {
  const chunks = [
    fallName(s),
    s.sterbefallId,
    s.abholort,
    s.bestattungsart,
    s.endziel,
    s.trauerfeierort,
    s.aufnahmeort,
    s.kuehlraumId,
    s.kuehlplatz,
    ...parts.map((p) => [p.label, p.ort, p.route, p.zeit, p.dayKey].filter(Boolean).join(' ')),
  ];
  return chunks
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

const TRAUERBLOCK_ART_ORDER: CalendarTerminArt[] = [
  'trauerfeier',
  'verabschiedung',
  'rosenkranz',
  'beisetzung',
];

function sortPartsChronologically(parts: AtomicTermin[]): AtomicTermin[] {
  return [...parts].sort((a, b) => a.sortMs - b.sortMs);
}

/** Zeitfenster ab Rosenkranz (falls vorhanden) bis letztem Teiltermin. */
function timeLabelFromParts(parts: AtomicTermin[]): string {
  const sorted = sortPartsChronologically(parts);
  const times = sorted.map((p) => p.zeit).filter((t): t is string => Boolean(t));
  if (times.length === 0) return '—';
  const uniq = [...new Set(times)];
  if (uniq.length === 1) return uniq[0]!;
  return `${uniq[0]}–${uniq[uniq.length - 1]}`;
}

function orderedBadgesFromParts(parts: AtomicTermin[]): string[] {
  const badges: string[] = [];
  for (const art of TRAUERBLOCK_ART_ORDER) {
    const p = parts.find((x) => x.art === art);
    if (p) badges.push(p.label);
  }
  return badges;
}

function subtitleFromGroupedParts(parts: AtomicTermin[]): string {
  const sorted = sortPartsChronologically(parts);
  const orte = sorted
    .map((p) => p.ort || p.route)
    .filter((o): o is string => Boolean(o));
  if (orte.length) return [...new Set(orte)].join(' · ');
  return '';
}

function withBestattungsMarker(s: Sterbefall, entry: WallCalendarEntry): WallCalendarEntry {
  const bestattungsMarker = calendarBestattungsMarker(s, entry.arts, entry.title);
  return bestattungsMarker ? { ...entry, bestattungsMarker } : entry;
}

function buildFeierBlockEntry(
  s: Sterbefall,
  groupParts: AtomicTermin[],
  dayKey: string,
  blockTitle: string,
  primaryArt: CalendarTerminArt
): WallCalendarEntry {
  const sorted = sortPartsChronologically(groupParts);
  const badges = orderedBadgesFromParts(sorted);
  const arts = [
    primaryArt,
    ...sorted.map((p) => p.art).filter((a, i, arr) => arr.indexOf(a) === i && a !== primaryArt),
  ];

  return withBestattungsMarker(s, {
    id: `${s.id}:block:${primaryArt}:${dayKey}`,
    docId: s.id,
    sterbefallId: s.sterbefallId ?? s.id,
    dayKey,
    dayLabel: formatDayLabelDe(dayKey),
    timeLabel: timeLabelFromParts(sorted),
    sortMs: Math.min(...sorted.map((p) => p.sortMs)),
    name: fallName(s),
    title: blockTitle,
    subtitle: subtitleFromGroupedParts(sorted),
    badges,
    grouped: true,
    arts,
    searchText: buildSearchText(s, sorted),
  });
}

/**
 * Trauerfeier: Rosenkranz + Feier + Beisetzung nur bei Im Anschluss am Trauerfeier-Tag.
 * Verabschiedung: Rosenkranz + Verabschiedung am selben Tag, Beisetzung separat.
 */
function collectTrauerblockEntries(
  s: Sterbefall,
  atoms: AtomicTermin[],
  used: Set<string>
): WallCalendarEntry[] {
  const tfDay = dayKeyFromDeDatum(s.trauerfeierdatum);
  const imAnschlussBlock = beisetzungImAnschlussAmTrauerfeierTag(s);
  const byDay = new Map<string, AtomicTermin[]>();

  for (const a of atoms) {
    if (used.has(a.key)) continue;
    if (
      a.art !== 'rosenkranz' &&
      a.art !== 'verabschiedung' &&
      a.art !== 'trauerfeier' &&
      a.art !== 'beisetzung'
    ) {
      continue;
    }
    const list = byDay.get(a.dayKey) ?? [];
    list.push(a);
    byDay.set(a.dayKey, list);
  }

  const entries: WallCalendarEntry[] = [];

  for (const [dayKey, dayAtoms] of byDay) {
    const rosen = dayAtoms.find((a) => a.art === 'rosenkranz' && !used.has(a.key));
    const ceremony = dayAtoms.find(
      (a) =>
        (a.art === 'trauerfeier' || a.art === 'verabschiedung') && !used.has(a.key)
    );
    const beisetzung = dayAtoms.find((a) => a.art === 'beisetzung' && !used.has(a.key));

    if (!ceremony) continue;

    if (imAnschlussBlock && tfDay === dayKey) {
      const groupParts: AtomicTermin[] = [];
      if (rosen) groupParts.push(rosen);
      groupParts.push(ceremony);
      if (beisetzung && beisetzung.dayKey === dayKey) groupParts.push(beisetzung);

      for (const p of groupParts) used.add(p.key);
      entries.push(
        buildFeierBlockEntry(s, groupParts, dayKey, 'Trauerfeier', 'trauerfeier')
      );
      continue;
    }

    if (rosen && ceremony.art === 'verabschiedung') {
      const groupParts = [rosen, ceremony];
      for (const p of groupParts) used.add(p.key);
      entries.push(
        buildFeierBlockEntry(s, groupParts, dayKey, 'Verabschiedung', 'verabschiedung')
      );
    }
  }

  return entries;
}

function atomicToEntry(s: Sterbefall, a: AtomicTermin): WallCalendarEntry {
  const name = fallName(s);
  const subtitle = a.route || a.ort || '';
  if (a.art === 'aufnahme') {
    return {
      id: a.key,
      docId: s.id,
      sterbefallId: s.sterbefallId ?? s.id,
      dayKey: a.dayKey,
      dayLabel: formatDayLabelDe(a.dayKey),
      timeLabel: a.zeit || '—',
      sortMs: a.sortMs,
      name: `Aufnahme - ${name}`,
      title: 'Aufnahme',
      subtitle,
      badges: ['Aufnahme'],
      grouped: false,
      arts: ['aufnahme'],
      searchText: buildSearchText(s, [a]),
    };
  }
  return withBestattungsMarker(s, {
    id: a.key,
    docId: s.id,
    sterbefallId: s.sterbefallId ?? s.id,
    dayKey: a.dayKey,
    dayLabel: formatDayLabelDe(a.dayKey),
    timeLabel: a.zeit || '—',
    sortMs: a.sortMs,
    name,
    title: a.label,
    subtitle,
    badges: [a.label],
    grouped: false,
    arts: [a.art],
    searchText: buildSearchText(s, [a]),
  });
}

function isUeberfuehrungCalendarArt(art: CalendarTerminArt): boolean {
  return art === 'ueberfuehrung' || art === 'ueberfuehrung_kremation';
}

export function isUeberfuehrungCalendarEntry(entry: WallCalendarEntry): boolean {
  // Zugehörige Überführung am Feiertermin zählt nicht als eigene Überführung.
  if (entry.attachedTransfer) return false;
  return entry.arts.some((a) => isUeberfuehrungCalendarArt(a));
}

const CEREMONY_HOST_ARTS: CalendarTerminArt[] = [
  'beisetzung',
  'verabschiedung',
  'trauerfeier',
  'trauerfeier2',
];

/** Feier-/Begräbnis-/Verabschiedungstermin, an den Überführungen hängen können. */
export function isCeremonyHostEntry(entry: Pick<WallCalendarEntry, 'arts'>): boolean {
  return entry.arts.some((a) => CEREMONY_HOST_ARTS.includes(a));
}

/** Reine Überführungs-Karte (ohne Feieranteil). */
export function isPureTransferEntry(entry: Pick<WallCalendarEntry, 'arts'>): boolean {
  return (
    entry.arts.length > 0 &&
    entry.arts.every((a) => isUeberfuehrungCalendarArt(a))
  );
}

/** Standard-Kremationsüberführung (kein Personal nötig). */
export function isKremationTransferEntry(entry: Pick<WallCalendarEntry, 'arts'>): boolean {
  return (
    entry.arts.length > 0 &&
    entry.arts.every((a) => a === 'ueberfuehrung_kremation')
  );
}

/** Überführung mit optionalem Fahrer (nicht Kremation). */
export function isFahrerTransferEntry(entry: Pick<WallCalendarEntry, 'arts'>): boolean {
  return isPureTransferEntry(entry) && !isKremationTransferEntry(entry);
}

function ceremonyHostRank(entry: Pick<WallCalendarEntry, 'arts'>): number {
  if (entry.arts.includes('beisetzung')) return 4;
  if (entry.arts.includes('verabschiedung')) return 3;
  if (entry.arts.includes('trauerfeier')) return 2;
  if (entry.arts.includes('trauerfeier2')) return 1;
  return 0;
}

/**
 * Hängt Überführungen am gleichen Tag an Begräbnis-/Verabschiedungs-/Trauerfeier-Termine.
 * Diese brauchen kein eigenes Personal — Personal läuft über den Feiertermin.
 */
export function attachTransfersToCeremonyEntries(
  entries: WallCalendarEntry[]
): WallCalendarEntry[] {
  const byFallDay = new Map<string, WallCalendarEntry[]>();
  for (const e of entries) {
    const key = `${e.docId}|${e.dayKey}`;
    const list = byFallDay.get(key) ?? [];
    list.push(e);
    byFallDay.set(key, list);
  }

  const removeIds = new Set<string>();
  const updates = new Map<string, WallCalendarEntry>();

  for (const group of byFallDay.values()) {
    const hosts = group.filter(isCeremonyHostEntry);
    const transfers = group.filter(isPureTransferEntry);
    if (hosts.length === 0 || transfers.length === 0) continue;

    let host = hosts[0]!;
    for (const h of hosts.slice(1)) {
      if (ceremonyHostRank(h) > ceremonyHostRank(host)) host = h;
    }

    let next: WallCalendarEntry = {
      ...host,
      badges: [...host.badges],
      arts: [...host.arts],
    };
    for (const t of transfers) {
      removeIds.add(t.id);
      for (const art of t.arts) {
        if (!next.arts.includes(art)) next.arts.push(art);
      }
      const routeOrBadge = t.subtitle?.trim()
        ? `Überf. ${t.subtitle}`
        : t.badges.find((b) => /über|krem|retour|abholung/i.test(b)) || 'Überführung';
      if (!next.badges.some((b) => b === routeOrBadge || b === 'Überführung')) {
        next.badges.push(routeOrBadge);
      }
      const subParts = [next.subtitle, t.subtitle].filter((s) => Boolean(s?.trim()));
      next.subtitle = [...new Set(subParts)].join(' · ');
      next.searchText = `${next.searchText} ${t.searchText} überführung`.toLowerCase();
      next.grouped = true;
      next.attachedTransfer = true;
    }
    updates.set(host.id, next);
  }

  if (removeIds.size === 0) return entries;

  return entries
    .filter((e) => !removeIds.has(e.id))
    .map((e) => updates.get(e.id) ?? e)
    .sort((a, b) => a.sortMs - b.sortMs || a.name.localeCompare(b.name, 'de'));
}

export function summarizeWallCalendarDay(entries: readonly WallCalendarEntry[]): {
  total: number;
  ueberfuehrungen: number;
} {
  let ueberfuehrungen = 0;
  for (const e of entries) {
    if (isUeberfuehrungCalendarEntry(e)) ueberfuehrungen++;
  }
  return { total: entries.length, ueberfuehrungen };
}

/** Kalendereintrag ist kein reiner Überführungstermin (für Tab „Heute“ neben flattenOffene). */
export function isFeierCalendarEntry(entry: WallCalendarEntry): boolean {
  return entry.arts.some((a) => !isUeberfuehrungCalendarArt(a));
}

/** Feier- und Beisetzungstermine an einem Kalendertag (z. B. Tab „Heute“). */
export function buildWallCalendarEntriesForDay(
  sterbefaelle: Sterbefall[],
  dayKey: string
): WallCalendarEntry[] {
  return buildWallCalendarEntries(sterbefaelle).filter((e) => e.dayKey === dayKey);
}

/** Wie {@link buildWallCalendarEntriesForDay}, ohne Überführungen (die kommen aus flattenOffene). */
export function buildWallFeierEntriesForDay(
  sterbefaelle: Sterbefall[],
  dayKey: string
): WallCalendarEntry[] {
  return buildWallCalendarEntriesForDay(sterbefaelle, dayKey).filter(isFeierCalendarEntry);
}

export function buildWallCalendarEntries(sterbefaelle: Sterbefall[]): WallCalendarEntry[] {
  const entries: WallCalendarEntry[] = [];

  for (const s of filterSterbefaelleFuerKalender(sterbefaelle)) {

    const atoms = collectAtomics(s);
    const used = new Set<string>();

    entries.push(...collectTrauerblockEntries(s, atoms, used));

    for (const a of atoms) {
      if (used.has(a.key)) continue;
      entries.push(atomicToEntry(s, a));
    }
  }

  return attachTransfersToCeremonyEntries(
    entries.sort((a, b) => a.sortMs - b.sortMs || a.name.localeCompare(b.name, 'de'))
  );
}

function dayKeyToDeDatum(dayKey: string): string | null {
  const m = dayKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/** Manuellen Zusatztermin als Kalender-Eintrag (z. B. Graben für Begräbnis). */
export function zusatzTerminToEntry(t: {
  id: string;
  docId: string;
  sterbefallId: string;
  name: string;
  art: 'graben' | 'sonstiges';
  title: string;
  dayKey: string;
  zeit?: string;
  ort?: string;
  note?: string;
}): WallCalendarEntry | null {
  const deDatum = dayKeyToDeDatum(t.dayKey);
  if (!deDatum) return null;
  const zeit = formatZeitDe(t.zeit) || undefined;
  const sortMs = parseDatumZeitDe(deDatum, zeit) ?? parseDatumZeitDe(deDatum, undefined, true);
  if (sortMs == null) return null;
  const calArt: CalendarTerminArt = t.art === 'graben' ? 'graben' : 'sonstiges';
  const artLabel = t.art === 'graben' ? 'Graben' : 'Sonstiges';
  const name = t.name.trim() || t.sterbefallId || t.docId;
  const subtitle = [t.ort, t.note].filter(Boolean).join(' · ');
  return {
    id: `zusatz:${t.id}`,
    docId: t.docId,
    sterbefallId: t.sterbefallId || t.docId,
    dayKey: t.dayKey,
    dayLabel: formatDayLabelDe(t.dayKey),
    timeLabel: zeit || '—',
    sortMs,
    name,
    title: t.title,
    subtitle,
    badges: [artLabel],
    grouped: false,
    arts: [calArt],
    searchText: [name, t.title, artLabel, t.ort, t.note, t.sterbefallId]
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
    zusatzTerminId: t.id,
  };
}

export function mergeZusatzTermineIntoEntries(
  entries: WallCalendarEntry[],
  zusatz: Iterable<{
    id: string;
    docId: string;
    sterbefallId: string;
    name: string;
    art: 'graben' | 'sonstiges';
    title: string;
    dayKey: string;
    zeit?: string;
    ort?: string;
    note?: string;
  }>
): WallCalendarEntry[] {
  const extra: WallCalendarEntry[] = [];
  for (const t of zusatz) {
    const e = zusatzTerminToEntry(t);
    if (e) extra.push(e);
  }
  if (extra.length === 0) return entries;
  return [...entries, ...extra].sort(
    (a, b) => a.sortMs - b.sortMs || a.name.localeCompare(b.name, 'de')
  );
}

/**
 * Geplante Überführungen aus der Planung in den Kalender mischen.
 * Bestehende Alamida-Überführungen am gleichen Tag/Route werden ersetzt/ergänzt.
 * Kremationen mit gleicher kremationGroupId werden zu einer Karte zusammengefasst.
 */
export function mergeTransferPlanIntoEntries(
  entries: WallCalendarEntry[],
  assignments: Record<
    string,
    {
      id: string;
      docId: string;
      plannedDayKey: string | null;
      plannedZeit?: string | null;
      vonOrt?: string | null;
      nachOrt?: string | null;
      schrittTyp?: string | null;
      kremationGroupId?: string | null;
    }
  >,
  sterbefaelle: Sterbefall[]
): WallCalendarEntry[] {
  const byId = new Map(sterbefaelle.map((s) => [s.id, s]));
  const planned: WallCalendarEntry[] = [];
  const coveredKeys = new Set<string>();
  const kremationGroups = new Map<
    string,
    {
      groupId: string;
      dayKey: string;
      zeit?: string;
      von: string;
      nach: string;
      members: { assignmentId: string; docId: string; name: string; sortMs: number }[];
    }
  >();

  for (const assignment of Object.values(assignments)) {
    const dayKey = assignment.plannedDayKey;
    if (!dayKey) continue;
    const s = byId.get(assignment.docId);
    if (!s) continue;
    const deDatum = dayKeyToDeDatum(dayKey);
    if (!deDatum) continue;
    const zeit = formatZeitDe(assignment.plannedZeit ?? undefined) || undefined;
    const sortMs =
      parseDatumZeitDe(deDatum, zeit) ?? parseDatumZeitDe(deDatum, undefined, true);
    if (sortMs == null) continue;
    const art = calendarArtFromSchritt(assignment.schrittTyp ?? undefined);
    const von = assignment.vonOrt?.trim() || '—';
    const nach = assignment.nachOrt?.trim() || '—';
    const title = schrittTypLabel(assignment.schrittTyp ?? 'ueberfuehrung');
    const name = fallName(s);
    const route = `${von} → ${nach}`;
    const gid = assignment.kremationGroupId?.trim();

    if (gid && art === 'ueberfuehrung_kremation') {
      coveredKeys.add(`${assignment.docId}|${dayKey}`);
      const existing = kremationGroups.get(gid);
      const member = {
        assignmentId: assignment.id,
        docId: s.id,
        name,
        sortMs,
      };
      if (existing) {
        existing.members.push(member);
        if (!existing.zeit && zeit) existing.zeit = zeit;
      } else {
        kremationGroups.set(gid, {
          groupId: gid,
          dayKey,
          zeit,
          von,
          nach,
          members: [member],
        });
      }
      continue;
    }

    const id = `plan:${assignment.id}`;
    coveredKeys.add(`${assignment.docId}|${dayKey}`);
    planned.push({
      id,
      docId: s.id,
      sterbefallId: s.sterbefallId ?? s.id,
      dayKey,
      dayLabel: formatDayLabelDe(dayKey),
      timeLabel: zeit || '—',
      sortMs,
      name,
      title,
      subtitle: route,
      badges: [title, 'Geplant'],
      grouped: false,
      arts: [art],
      searchText: [name, title, route, s.sterbefallId, 'geplant']
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
      bestattungsMarker: calendarBestattungsMarker(s, [art], title),
    });
  }

  for (const group of kremationGroups.values()) {
    if (group.members.length < 2) {
      // Verwaiste Einzel-ID → normale Plan-Karte
      const m = group.members[0]!;
      const s = byId.get(m.docId);
      if (!s) continue;
      const route = `${group.von} → ${group.nach}`;
      planned.push({
        id: `plan:${m.assignmentId}`,
        docId: s.id,
        sterbefallId: s.sterbefallId ?? s.id,
        dayKey: group.dayKey,
        dayLabel: formatDayLabelDe(group.dayKey),
        timeLabel: group.zeit || '—',
        sortMs: m.sortMs,
        name: m.name,
        title: 'Kremation',
        subtitle: route,
        badges: ['Kremation', 'Geplant'],
        grouped: false,
        arts: ['ueberfuehrung_kremation'],
        searchText: [m.name, 'kremation', route, 'geplant'].join(' ').toLowerCase(),
        bestattungsMarker: calendarBestattungsMarker(s, ['ueberfuehrung_kremation'], 'Kremation'),
      });
      continue;
    }

    const members = [...group.members].sort(
      (a, b) => a.sortMs - b.sortMs || a.name.localeCompare(b.name, 'de')
    );
    const host = byId.get(members[0]!.docId)!;
    const names = members.map((m) => m.name);
    const route = `${group.von} → ${group.nach}`;
    planned.push({
      id: `plan:krem-group:${group.groupId}`,
      docId: members[0]!.docId,
      sterbefallId: host.sterbefallId ?? host.id,
      dayKey: group.dayKey,
      dayLabel: formatDayLabelDe(group.dayKey),
      timeLabel: group.zeit || '—',
      sortMs: members[0]!.sortMs,
      name: 'Kremation',
      title: 'Kremation',
      subtitle: route,
      badges: ['Kremation', `${members.length}×`, 'Geplant'],
      grouped: true,
      arts: ['ueberfuehrung_kremation'],
      searchText: [...names, 'kremation', route, 'geplant', String(members.length)]
        .join(' ')
        .toLowerCase(),
      bestattungsMarker: 'U',
      kremationGroupId: group.groupId,
      kremationMemberNames: names,
    });
  }

  if (planned.length === 0) return entries;

  // Alamida-Überführungen am selben Tag für geplante Fälle ausblenden (Planung hat Vorrang)
  const filtered = entries.filter((e) => {
    if (!isUeberfuehrungCalendarEntry(e) && !isPureTransferEntry(e)) return true;
    return !coveredKeys.has(`${e.docId}|${e.dayKey}`);
  });

  // Geplante Überführungen an Feiertermine hängen (kein eigener Personalbedarf)
  return attachTransfersToCeremonyEntries(
    [...filtered, ...planned].sort(
      (a, b) => a.sortMs - b.sortMs || a.name.localeCompare(b.name, 'de')
    )
  );
}

function monthStartKey(anchor: Date): string {
  return dayKeyFromDate(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
}

function monthEndKey(anchor: Date): string {
  return dayKeyFromDate(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0));
}

function dateFromDayKey(dayKey: string): Date {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function monthRangeFromKey(anchor: Date): string {
  return monthStartKey(anchor);
}

function monthRangeToKey(anchor: Date): string {
  return monthEndKey(anchor);
}

export function filterEntriesForAnchorMonth(
  entries: WallCalendarEntry[],
  anchor: Date
): WallCalendarEntry[] {
  const fromKey = monthStartKey(anchor);
  const toKey = monthEndKey(anchor);
  return entries.filter((e) => e.dayKey >= fromKey && e.dayKey <= toKey);
}

export function filterEntriesInDayRange(
  entries: WallCalendarEntry[],
  fromKey: string,
  toKey: string
): WallCalendarEntry[] {
  return entries.filter((e) => e.dayKey >= fromKey && e.dayKey <= toKey);
}

export function buildWallCalendarDaysInRange(
  entries: WallCalendarEntry[],
  anchor: Date,
  fromKey: string,
  toKey: string
): WallCalendarDay[] {
  const todayKey = dayKeyFromDate(anchor);
  const entriesByDay = new Map<string, WallCalendarEntry[]>();

  for (const entry of entries) {
    if (entry.dayKey < fromKey || entry.dayKey > toKey) continue;
    const list = entriesByDay.get(entry.dayKey);
    if (list) list.push(entry);
    else entriesByDay.set(entry.dayKey, [entry]);
  }

  for (const list of entriesByDay.values()) {
    list.sort((a, b) => a.sortMs - b.sortMs || a.name.localeCompare(b.name, 'de'));
  }

  const days: WallCalendarDay[] = [];
  let cursor = dateFromDayKey(fromKey);
  const end = dateFromDayKey(toKey);
  while (cursor.getTime() <= end.getTime()) {
    const dayKey = dayKeyFromDate(cursor);
    const dayEntries = entriesByDay.get(dayKey) ?? [];
    days.push({
      dayKey,
      dayLabel: formatDayLabelDe(dayKey),
      weekdayShort: cursor.toLocaleDateString('de-AT', { weekday: 'short' }),
      isToday: dayKey === todayKey,
      isWeekend: cursor.getDay() === 0 || cursor.getDay() === 6,
      entries: dayEntries,
    });
    cursor = addDays(cursor, 1);
  }

  return days;
}

export function buildWallCalendarDaysForAnchorMonth(
  entries: WallCalendarEntry[],
  anchor: Date
): WallCalendarDay[] {
  return buildWallCalendarDaysInRange(
    entries,
    anchor,
    monthStartKey(anchor),
    monthEndKey(anchor)
  );
}

export function isWallCalendarDayInAnchorMonth(dayKey: string, anchor: Date): boolean {
  const [y, m] = dayKey.split('-').map(Number);
  return y === anchor.getFullYear() && m - 1 === anchor.getMonth();
}

export const MONTH_OVERVIEW_WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;

export type MonthOverviewCell = WallCalendarDay | null;

export interface MonthOverviewGrid {
  weekdayLabels: readonly string[];
  cells: MonthOverviewCell[];
}

function wallCalendarDayForDate(d: Date, todayKey: string, entries: WallCalendarDay['entries'] = []): WallCalendarDay {
  const dayKey = dayKeyFromDate(d);
  return {
    dayKey,
    dayLabel: formatDayLabelDe(dayKey),
    weekdayShort: d.toLocaleDateString('de-AT', { weekday: 'short' }),
    isToday: dayKey === todayKey,
    isWeekend: d.getDay() === 0 || d.getDay() === 6,
    entries,
  };
}

/** Monatsübersicht Mo–So mit leeren Zellen vor/nach dem Monat. */
export function buildMonthOverviewGrid(
  monthDays: WallCalendarDay[],
  anchor: Date,
  todayKey: string
): MonthOverviewGrid {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const total = Math.ceil((offset + daysInMonth) / 7) * 7;
  const byKey = new Map(monthDays.map((d) => [d.dayKey, d]));
  const cells: MonthOverviewCell[] = [];

  for (let i = 0; i < total; i++) {
    const dom = i - offset + 1;
    if (dom < 1 || dom > daysInMonth) {
      cells.push(null);
      continue;
    }
    const dayKey = dayKeyFromDate(new Date(y, m, dom));
    cells.push(byKey.get(dayKey) ?? wallCalendarDayForDate(new Date(y, m, dom), todayKey));
  }

  return { weekdayLabels: MONTH_OVERVIEW_WEEKDAY_LABELS, cells };
}

function weekSpanFromAnchor(anchor: Date, weeks: 1 | 2): { fromKey: string; toKey: string; count: number } {
  const monday = startOfWeekMonday(anchor);
  const count = weeks * 7;
  return {
    fromKey: dayKeyFromDate(monday),
    toKey: dayKeyFromDate(addDays(monday, count - 1)),
    count,
  };
}

export function filterCalendarEntries(
  entries: WallCalendarEntry[],
  range: WallCalendarRange,
  anchor: Date,
  query: string
): WallCalendarEntry[] {
  const q = query.trim().toLowerCase();
  let fromKey: string;
  let toKey: string;

  if (range === 'month') {
    fromKey = monthRangeFromKey(anchor);
    toKey = monthRangeToKey(anchor);
  } else {
    const weeks = range === 14 ? 2 : 1;
    ({ fromKey, toKey } = weekSpanFromAnchor(anchor, weeks));
  }

  return entries.filter((e) => {
    if (e.dayKey < fromKey || e.dayKey > toKey) return false;
    if (q && !e.searchText.includes(q)) return false;
    return true;
  });
}

export function buildWallCalendarDays(
  entries: WallCalendarEntry[],
  range: WallCalendarRange,
  anchor: Date
): WallCalendarDay[] {
  const todayKey = dayKeyFromDate(anchor);
  const days: WallCalendarDay[] = [];
  const entriesByDay = new Map<string, WallCalendarEntry[]>();

  for (const entry of entries) {
    const list = entriesByDay.get(entry.dayKey);
    if (list) {
      list.push(entry);
    } else {
      entriesByDay.set(entry.dayKey, [entry]);
    }
  }

  for (const list of entriesByDay.values()) {
    list.sort((a, b) => a.sortMs - b.sortMs || a.name.localeCompare(b.name, 'de'));
  }

  let cursor: Date;
  let count: number;

  if (range === 'month') {
    const fromKey = monthRangeFromKey(anchor);
    const toKey = monthRangeToKey(anchor);
    return buildWallCalendarDaysInRange(entries, anchor, fromKey, toKey);
  }

  const weeks = range === 14 ? 2 : 1;
  cursor = startOfWeekMonday(anchor);
  count = weeks * 7;

  for (let i = 0; i < count; i++) {
    const d = addDays(cursor, i);
    const dayKey = dayKeyFromDate(d);
    const dayEntries = entriesByDay.get(dayKey) ?? [];

    days.push({
      dayKey,
      dayLabel: formatDayLabelDe(dayKey),
      weekdayShort: d.toLocaleDateString('de-AT', { weekday: 'short' }),
      isToday: dayKey === todayKey,
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
      entries: dayEntries,
    });
  }

  return days;
}

export function countCalendarEntries(entries: WallCalendarEntry[]): number {
  return entries.length;
}
