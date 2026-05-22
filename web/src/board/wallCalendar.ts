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

  const add = (
    art: CalendarTerminArt,
    label: string,
    datum?: string,
    zeit?: string,
    ort?: string,
    route?: string
  ) => {
    const dayKey = dayKeyFromDeDatum(datum);
    if (!dayKey) return;
    const dedupeKey = `${art}:${dayKey}:${zeit ?? ''}:${route ?? ''}:${ort ?? ''}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
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
    add('ueberfuehrung', schrittTypLabel(a.schrittTyp), datum, undefined, undefined, `${von} → ${nach}`);
  }

  for (const v of s.verlauf ?? []) {
    const datum = v.terminAm ?? v.abholungAm;
    if (!datum?.trim()) continue;
    const von = v.vonOrt ?? v.ort ?? '—';
    const nach = v.nachOrt ?? '—';
    add('ueberfuehrung', schrittTypLabel(v.typ), datum, undefined, v.ort, `${von} → ${nach}`);
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

function timeLabelFromParts(parts: AtomicTermin[]): string {
  const times = parts.map((p) => p.zeit).filter(Boolean);
  if (times.length === 0) return '—';
  const uniq = [...new Set(times)];
  return uniq.join(' · ');
}

function subtitleFromParts(parts: AtomicTermin[]): string {
  const routes = parts.map((p) => p.route).filter(Boolean);
  if (routes.length) return routes[0]!;
  const orte = parts.map((p) => p.ort).filter(Boolean);
  return orte.length ? [...new Set(orte)].join(' · ') : '';
}

function tryBuildTrauerblock(
  s: Sterbefall,
  atoms: AtomicTermin[],
  used: Set<string>
): WallCalendarEntry | null {
  const rosen = atoms.filter((a) => a.art === 'rosenkranz' && !used.has(a.key));
  const verabs = atoms.filter(
    (a) => (a.art === 'verabschiedung' || a.art === 'trauerfeier') && !used.has(a.key)
  );
  const beisetzungen = atoms.filter((a) => a.art === 'beisetzung' && !used.has(a.key));
  const imAnschluss = istImAnschluss(s.imAnschluss);

  for (const r of rosen) {
    const v = verabs.find((t) => t.dayKey === r.dayKey);
    if (!v) continue;

    const groupParts: AtomicTermin[] = [r, v];
    used.add(r.key);
    used.add(v.key);

    let beisetzung: AtomicTermin | undefined;
    if (imAnschluss) {
      beisetzung = beisetzungen.find((b) => b.dayKey === r.dayKey);
      if (beisetzung) {
        groupParts.push(beisetzung);
        used.add(beisetzung.key);
      }
    }

    const badges = groupParts.map((p) => p.label);
    const title =
      badges.length >= 2
        ? badges.join(' · ')
        : badges[0] ?? 'Trauertermin';

    return {
      id: `${s.id}:block:${r.dayKey}`,
      docId: s.id,
      sterbefallId: s.sterbefallId ?? s.id,
      dayKey: r.dayKey,
      dayLabel: formatDayLabelDe(r.dayKey),
      timeLabel: timeLabelFromParts(groupParts),
      sortMs: Math.min(...groupParts.map((p) => p.sortMs)),
      name: fallName(s),
      title,
      subtitle: subtitleFromParts(groupParts),
      badges,
      grouped: true,
      arts: ['trauerblock', ...groupParts.map((p) => p.art)],
      searchText: buildSearchText(s, groupParts),
    };
  }

  return null;
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

    const block = tryBuildTrauerblock(s, atoms, used);
    if (block) entries.push(block);

    for (const a of atoms) {
      if (used.has(a.key)) continue;
      entries.push(atomicToEntry(s, a));
    }
  }

  return entries.sort((a, b) => a.sortMs - b.sortMs || a.name.localeCompare(b.name, 'de'));
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
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    fromKey = dayKeyFromDate(start);
    toKey = dayKeyFromDate(end);
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
    cursor = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    count = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
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
