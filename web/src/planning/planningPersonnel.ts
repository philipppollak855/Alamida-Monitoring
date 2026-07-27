import type { CeremonyInfo, PlanningCard } from '../planning/types';
import type { Sterbefall } from '../types';
import type { DispositionPerson } from '../types/dispositionSettings';
import type { PersonnelAbsence, PersonnelBooking } from '../types/personnelBooking';
import type { CalendarTerminArt, WallCalendarEntry } from '../board/wallCalendar';
import { formatDayLabelDe } from '../board/dateUtils';
import {
  ceremonyBookingId,
  findBookingForCeremony,
  isBegraebnisEntry,
  isPersonAbsentOnDay,
  minTraegerForEntry,
  personnelBookingTraegerLine,
} from '../board/personnelBookingRules';

function kindToArt(kind: CeremonyInfo['kind']): CalendarTerminArt {
  switch (kind) {
    case 'beisetzung':
      return 'beisetzung';
    case 'trauerfeier':
      return 'trauerfeier';
    case 'verabschiedung':
      return 'verabschiedung';
    case 'kremation':
      return 'ueberfuehrung_kremation';
  }
}

function kindTitle(kind: CeremonyInfo['kind']): string {
  switch (kind) {
    case 'beisetzung':
      return 'Beisetzung';
    case 'trauerfeier':
      return 'Trauerfeier';
    case 'verabschiedung':
      return 'Verabschiedung';
    case 'kremation':
      return 'Kremation';
  }
}

function transferArt(schrittTyp?: string): CalendarTerminArt {
  const t = (schrittTyp ?? '').trim().toLowerCase();
  if (t.includes('krem')) return 'ueberfuehrung_kremation';
  return 'ueberfuehrung';
}

function transferTitle(schrittTyp?: string): string {
  const t = (schrittTyp ?? '').trim().toLowerCase();
  if (t.includes('abholung')) return 'Abholung';
  if (t.includes('krem')) return 'Überführung Kremation';
  return 'Überführung';
}

/** WallCalendarEntry-Adapter für Personal-Dialog aus Planungs-Zeremonie. */
export function wallEntryFromPlanningCeremony(
  fall: Sterbefall,
  ceremony: CeremonyInfo,
  name: string
): WallCalendarEntry {
  const dayKey = ceremony.dayKey ?? '';
  const art = kindToArt(ceremony.kind);
  const title = kindTitle(ceremony.kind);
  return {
    id: ceremonyBookingId(fall.id, ceremony.kind, dayKey),
    docId: fall.id,
    sterbefallId: fall.sterbefallId ?? fall.id,
    dayKey,
    dayLabel: dayKey ? formatDayLabelDe(dayKey) : '',
    timeLabel: ceremony.zeit || ceremony.datum || '—',
    sortMs: 0,
    name,
    title,
    subtitle: ceremony.ort || '',
    badges: [title],
    grouped: false,
    arts: [art],
    searchText: `${name} ${title}`,
    bestattungsMarker: ceremony.bestattungsMarker,
  };
}

/** WallCalendarEntry-Adapter für Personal an Überführungs-Karten. */
export function wallEntryFromPlanningTransfer(
  fall: Sterbefall,
  card: PlanningCard
): WallCalendarEntry | null {
  const dayKey = card.plannedDayKey;
  if (!dayKey) return null;
  const title = transferTitle(card.schrittTyp);
  const art = transferArt(card.schrittTyp);
  return {
    id: `transfer:${card.id}`,
    docId: fall.id,
    sterbefallId: card.sterbefallId || fall.sterbefallId || fall.id,
    dayKey,
    dayLabel: formatDayLabelDe(dayKey),
    timeLabel: card.plannedZeit || card.terminAm || '—',
    sortMs: 0,
    name: card.name,
    title,
    subtitle: `${card.vonOrt} → ${card.nachOrt}`,
    badges: [title],
    grouped: false,
    arts: [art],
    searchText: `${card.name} ${title}`,
  };
}

export function planningTransferPersonnelLine(
  booking: PersonnelBooking | null | undefined,
  pool: DispositionPerson[]
): string | null {
  if (!booking) return null;
  const byId = new Map(pool.map((p) => [p.id, p]));
  const names: string[] = [];
  for (const id of booking.traegerIds) {
    const p = byId.get(id);
    if (!p?.name) continue;
    names.push(p.extern ? `${p.name} (extern)` : p.name);
  }
  if (booking.arrangeurId) {
    const p = byId.get(booking.arrangeurId);
    if (p?.name) names.unshift(p.extern ? `${p.name} (extern)` : p.name);
  }
  if (names.length === 0) return null;
  return names.join(' · ');
}

export type PlanningDayAbsence = {
  personId: string;
  name: string;
  extern: boolean;
  note?: string;
  fromDayKey: string;
  toDayKey: string;
};

export function absencesForDay(
  absences: Record<string, PersonnelAbsence>,
  dayKey: string,
  pool: DispositionPerson[]
): PlanningDayAbsence[] {
  const byId = new Map(pool.map((p) => [p.id, p]));
  const out: PlanningDayAbsence[] = [];
  for (const a of Object.values(absences)) {
    if (!(a.fromDayKey <= dayKey && dayKey <= a.toDayKey)) continue;
    if (!isPersonAbsentOnDay(absences, a.personId, dayKey)) continue;
    const person = byId.get(a.personId);
    if (!person || person.active === false) continue;
    if (out.some((x) => x.personId === a.personId)) continue;
    out.push({
      personId: a.personId,
      name: person.name,
      extern: person.extern === true,
      note: a.note,
      fromDayKey: a.fromDayKey,
      toDayKey: a.toDayKey,
    });
  }
  return out.sort((a, b) => {
    if (a.extern !== b.extern) return a.extern ? 1 : -1;
    return a.name.localeCompare(b.name, 'de');
  });
}

export function formatDayAbsencesLine(items: PlanningDayAbsence[]): string | null {
  if (items.length === 0) return null;
  return items.map((p) => (p.extern ? `${p.name} (extern)` : p.name)).join(', ');
}

export function planningCeremonyNeedsLine(
  ceremony: CeremonyInfo,
  booking: PersonnelBooking | null | undefined,
  _pool: DispositionPerson[]
): string {
  const title = kindTitle(ceremony.kind);
  const entryLike = {
    arts: [kindToArt(ceremony.kind)],
    title,
    bestattungsMarker: ceremony.bestattungsMarker,
  };
  const isBegraebnis = isBegraebnisEntry(entryLike);
  const parts: string[] = [];

  if (isBegraebnis) {
    parts.push('1 Arrangeur');
    if (ceremony.bestattungsMarker === 'S') {
      const min = minTraegerForEntry(entryLike, booking?.traegerVonFamilie === true);
      if (booking?.traegerVonFamilie) parts.push('Träger Familie');
      else if (min > 0) parts.push(`${min} Träger`);
      else parts.push('Träger nach Bedarf');
    } else {
      parts.push('Träger nach Bedarf');
    }
  } else if (ceremony.kind === 'trauerfeier' || ceremony.kind === 'verabschiedung') {
    parts.push('Arrangeur optional');
  } else if (ceremony.kind === 'kremation') {
    parts.push('Fahrer / Überführung (max. 2)');
  }

  const when = ceremony.zeit ? ` um ${ceremony.zeit}` : '';
  return `Bedarf${when}: ${parts.join(' · ')}`;
}

export function planningCeremonyPersonnelLine(
  booking: PersonnelBooking | null | undefined,
  pool: DispositionPerson[]
): string | null {
  if (!booking) return null;
  const byId = new Map(pool.map((p) => [p.id, p]));
  const parts: string[] = [];
  if (booking.arrangeurId) {
    const p = byId.get(booking.arrangeurId);
    if (p?.name) {
      parts.push(p.extern ? `Arr. ${p.name} (extern)` : `Arr. ${p.name}`);
    } else {
      parts.push('Arrangeur');
    }
  }
  const traeger = personnelBookingTraegerLine(booking, pool);
  if (traeger) parts.push(traeger);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function enrichPlanningCeremonies(
  ceremonies: Array<{ docId: string; name: string; ceremony: CeremonyInfo }>,
  bookings: Record<string, PersonnelBooking>,
  pool: DispositionPerson[]
) {
  return ceremonies.map((c) => {
    const booking = findBookingForCeremony(
      bookings,
      c.docId,
      c.ceremony.dayKey ?? '',
      c.ceremony.kind
    );
    return {
      ...c,
      booking,
      needsLine: planningCeremonyNeedsLine(c.ceremony, booking, pool),
      personnelLine: planningCeremonyPersonnelLine(booking, pool),
    };
  });
}
