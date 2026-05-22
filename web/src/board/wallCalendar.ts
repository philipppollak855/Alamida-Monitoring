import type { Sterbefall } from '../types';
import { schrittTypLabel } from '../types';
import {
  addDays,
  dayKeyFromDate,
  dayKeyFromDeDatum,
  formatDayLabelDe,
  formatZeitDe,
  parseDatumZeitDe,
} from './dateUtils';

export type WallCalendarRange = 7 | 14 | 'month';

export type CalendarTerminArt =
  | 'rosenkranz'
  | 'verabschiedung'
  | 'trauerfeier'
  | 'trauerfeier2'
  | 'beisetzung'
  | 'ueberfuehrung'
  | 'trauerblock';

export const ALL_CALENDAR_TERMIN_ARTEN: CalendarTerminArt[] = [
  'rosenkranz',
  'verabschiedung',
  'trauerfeier',
  'trauerfeier2',
  'beisetzung',
  'ueberfuehrung',
  'trauerblock',
];

export const CALENDAR_TERMIN_ART_LABELS: Record<CalendarTerminArt, string> = {
  rosenkranz: 'Rosenkranz',
  verabschiedung: 'Verabschiedung',
  trauerfeier: 'Trauerfeier',
  trauerfeier2: 'Trauerfeier 2',
  beisetzung: 'Beisetzung',
  ueberfuehrung: 'Überführung',
  trauerblock: 'Trauerblock',
};

export function isCalendarTerminArt(v: unknown): v is CalendarTerminArt {
  return typeof v === 'string' && ALL_CALENDAR_TERMIN_ARTEN.includes(v as CalendarTerminArt);
}

/** Mehrfachfilter: Eintrag sichtbar, wenn mindestens eine seiner Arten aktiv ist. */
export function filterEntriesByArts(
  entries: WallCalendarEntry[],
  activeArts: ReadonlySet<CalendarTerminArt>
): WallCalendarEntry[] {
  if (activeArts.size === 0) return [];
  if (activeArts.size >= ALL_CALENDAR_TERMIN_ARTEN.length) return entries;
  return entries.filter((e) => e.arts.some((a) => activeArts.has(a)));
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

function istImAnschluss(raw?: boolean | string): boolean {
  if (raw === true) return true;
  if (!raw) return false;
  const t = String(raw).trim().toLowerCase();
  return (
    t === '1' ||
    t === 'ja' ||
    t === 'yes' ||
    t === 'true' ||
    t === 'x' ||
    t.includes('im anschluss') ||
    t.includes('im anschluß')
  );
}

function pushAtomic(
  list: AtomicTermin[],
  s: Sterbefall,
  art: CalendarTerminArt,
  label: string,
  datum?: string,
  zeit?: string,
  ort?: string,
  route?: string
) {
  const dayKey = dayKeyFromDeDatum(datum);
  if (!dayKey) return;
  const sortMs = parseDatumZeitDe(datum, zeit) ?? parseDatumZeitDe(datum, undefined, true)!;
  list.push({
    key: `${s.id}:${art}:${dayKey}:${zeit ?? ''}`,
    art,
    label,
    dayKey,
    sortMs,
    zeit: formatZeitDe(zeit) || undefined,
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
    datum?: string,
    zeit?: string,
    ort?: string,
    route?: string,
    dedupeKey?: string
  ) => {
    const dayKey = dayKeyFromDeDatum(datum);
    if (!dayKey) return;
    const key =
      dedupeKey ??
      `${art}:${dayKey}:${zeit ?? ''}:${route ?? ''}:${ort ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    pushAtomic(atoms, s, art, label, datum, zeit, ort, route);
  };
  const ortTf = s.endziel?.trim();
  const ortBeisetzung = s.endziel?.trim();

  if (s.rosenkranzdatum?.trim()) {
    add('rosenkranz', 'Rosenkranz', s.rosenkranzdatum, s.rosenkranzzeit, s.rosenkranzort);
  }

  if (s.trauerfeierdatum?.trim()) {
    const label = s.rosenkranzdatum?.trim() ? 'Verabschiedung' : 'Trauerfeier';
    const art: CalendarTerminArt = s.rosenkranzdatum?.trim() ? 'verabschiedung' : 'trauerfeier';
    add(art, label, s.trauerfeierdatum, s.trauerfeierzeit, ortTf);
  }

  if (s.trauerfeier2datum?.trim()) {
    add('trauerfeier2', 'Trauerfeier 2', s.trauerfeier2datum, s.trauerfeier2zeit, s.trauerfeier2ort ?? ortTf);
  }

  if (s.beisetzungsdatum?.trim()) {
    add('beisetzung', 'Beisetzung', s.beisetzungsdatum, s.beisetzungszeit, ortBeisetzung);
  }

  for (const a of s.ausstehend ?? []) {
    const datum = a.terminAm ?? a.abholungAm;
    if (!datum?.trim()) continue;
    const von = a.vonOrt ?? '—';
    const nach = a.nachOrt ?? '—';
    const key = ueberfuehrungKey(datum, a.schrittTyp, von, nach);
    add(
      'ueberfuehrung',
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
      'ueberfuehrung',
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
    s.sterbeort,
    s.abholort,
    s.bestattungsart,
    s.endziel,
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

function primaryArtFromParts(parts: AtomicTermin[]): CalendarTerminArt {
  for (const art of TRAUERBLOCK_ART_ORDER) {
    if (parts.some((p) => p.art === art)) return art;
  }
  return parts[0]!.art;
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

function buildTrauerblockEntry(
  s: Sterbefall,
  groupParts: AtomicTermin[],
  dayKey: string
): WallCalendarEntry {
  const sorted = sortPartsChronologically(groupParts);
  const badges = orderedBadgesFromParts(sorted);
  const primaryArt = primaryArtFromParts(sorted);
  const arts = [
    primaryArt,
    ...sorted.map((p) => p.art).filter((a, i, arr) => arr.indexOf(a) === i && a !== primaryArt),
  ];

  return {
    id: `${s.id}:block:${dayKey}`,
    docId: s.id,
    sterbefallId: s.sterbefallId ?? s.id,
    dayKey,
    dayLabel: formatDayLabelDe(dayKey),
    timeLabel: timeLabelFromParts(sorted),
    sortMs: Math.min(...sorted.map((p) => p.sortMs)),
    name: fallName(s),
    title: badges.join(' · '),
    subtitle: subtitleFromGroupedParts(sorted),
    badges,
    grouped: true,
    arts,
    searchText: buildSearchText(s, sorted),
  };
}

/** Rosenkranz + Trauerfeier/Verabschiedung (+ Beisetzung im Anschluss am selben Tag) = ein Termin. */
function collectTrauerblockEntries(
  s: Sterbefall,
  atoms: AtomicTermin[],
  used: Set<string>
): WallCalendarEntry[] {
  const imAnschluss = istImAnschluss(s.imAnschluss);
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
    const trauerfeier = dayAtoms.find(
      (a) =>
        (a.art === 'trauerfeier' || a.art === 'verabschiedung') && !used.has(a.key)
    );
    const beisetzung = dayAtoms.find((a) => a.art === 'beisetzung' && !used.has(a.key));

    if (!trauerfeier) continue;

    const groupParts: AtomicTermin[] = [];
    if (rosen) groupParts.push(rosen);
    groupParts.push(trauerfeier);
    if (imAnschluss && beisetzung && beisetzung.dayKey === dayKey) {
      groupParts.push(beisetzung);
    }

    const hasRosen = Boolean(rosen);
    const hasBeisetzungImBlock = groupParts.some((p) => p.art === 'beisetzung');
    if (groupParts.length < 2) continue;
    if (!hasRosen && !hasBeisetzungImBlock) continue;

    for (const p of groupParts) used.add(p.key);
    entries.push(buildTrauerblockEntry(s, groupParts, dayKey));
  }

  return entries;
}

function atomicToEntry(s: Sterbefall, a: AtomicTermin): WallCalendarEntry {
  const subtitle = a.route || a.ort || '';
  return {
    id: a.key,
    docId: s.id,
    sterbefallId: s.sterbefallId ?? s.id,
    dayKey: a.dayKey,
    dayLabel: formatDayLabelDe(a.dayKey),
    timeLabel: a.zeit || '—',
    sortMs: a.sortMs,
    name: fallName(s),
    title: a.label,
    subtitle,
    badges: [a.label],
    grouped: false,
    arts: [a.art],
    searchText: buildSearchText(s, [a]),
  };
}

export function buildWallCalendarEntries(sterbefaelle: Sterbefall[]): WallCalendarEntry[] {
  const entries: WallCalendarEntry[] = [];

  for (const s of sterbefaelle) {
    if (s.historieGrund === 'manuell_entfernt') continue;

    const atoms = collectAtomics(s);
    const used = new Set<string>();

    entries.push(...collectTrauerblockEntries(s, atoms, used));

    for (const a of atoms) {
      if (used.has(a.key)) continue;
      entries.push(atomicToEntry(s, a));
    }
  }

  return entries.sort((a, b) => a.sortMs - b.sortMs || a.name.localeCompare(b.name, 'de'));
}

/** Monatsansicht: mindestens so viele Tage vor/nach dem Kalendermonat (auch ohne Termine). */
const MONTH_MIN_BACKWARD_DAYS = 365;
const MONTH_MIN_FORWARD_DAYS = 365;

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

/** Monatsansicht: auch in die Vergangenheit erweitern (Termine + Mindestfenster). */
function monthRangeFromKey(anchor: Date, entries: WallCalendarEntry[]): string {
  let fromKey = monthStartKey(anchor);
  const minBackward = dayKeyFromDate(
    addDays(new Date(anchor.getFullYear(), anchor.getMonth(), 1), -MONTH_MIN_BACKWARD_DAYS)
  );
  if (minBackward < fromKey) fromKey = minBackward;

  for (const e of entries) {
    if (e.dayKey < fromKey) fromKey = e.dayKey;
  }
  return fromKey;
}

/** Monatsansicht: durchgehend über Monatsende hinaus (Termine + Mindestfenster). */
function monthRangeToKey(anchor: Date, entries: WallCalendarEntry[]): string {
  const fromKey = monthStartKey(anchor);
  let toKey = monthEndKey(anchor);

  const minForward = dayKeyFromDate(
    addDays(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0), MONTH_MIN_FORWARD_DAYS)
  );
  if (minForward > toKey) toKey = minForward;

  for (const e of entries) {
    if (e.dayKey >= fromKey && e.dayKey > toKey) toKey = e.dayKey;
  }
  return toKey;
}

export function isWallCalendarDayInAnchorMonth(dayKey: string, anchor: Date): boolean {
  const [y, m] = dayKey.split('-').map(Number);
  return y === anchor.getFullYear() && m - 1 === anchor.getMonth();
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
    fromKey = monthRangeFromKey(anchor, entries);
    toKey = monthRangeToKey(anchor, entries);
  } else {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    const end = addDays(start, range - 1);
    fromKey = dayKeyFromDate(start);
    toKey = dayKeyFromDate(end);
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

  let cursor: Date;
  let count: number;

  if (range === 'month') {
    const fromKey = monthRangeFromKey(anchor, entries);
    const toKey = monthRangeToKey(anchor, entries);
    cursor = dateFromDayKey(fromKey);
    const endExtended = dateFromDayKey(toKey);
    count = Math.floor((endExtended.getTime() - cursor.getTime()) / 86400000) + 1;
    if (!Number.isFinite(count) || count < 1) {
      count = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
    }
  } else {
    cursor = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    count = range;
  }

  for (let i = 0; i < count; i++) {
    const d = addDays(cursor, i);
    const dayKey = dayKeyFromDate(d);
    const dayEntries = entries
      .filter((e) => e.dayKey === dayKey)
      .sort((a, b) => a.sortMs - b.sortMs || a.name.localeCompare(b.name, 'de'));

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
