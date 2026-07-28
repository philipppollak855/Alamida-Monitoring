import type { CeremonyInfo, PlanningCard } from '../planning/types';
import type { Sterbefall } from '../types';
import type { DispositionPerson } from '../types/dispositionSettings';
import type { PersonnelBooking } from '../types/personnelBooking';
import type { CalendarTerminArt, WallCalendarEntry } from '../board/wallCalendar';
import { formatDayLabelDe } from '../board/dateUtils';
import { schrittTypLabel } from '../types';
import {
  ceremonyBookingId,
  findBookingForCeremony,
  findBookingForWallEntry,
  isBegraebnisEntry,
  isPersonnelBookingIncomplete,
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

function transferArt(schrittTyp: string): CalendarTerminArt {
  return schrittTyp.trim().toLowerCase() === 'kremation'
    ? 'ueberfuehrung_kremation'
    : 'ueberfuehrung';
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

/** Personal-Dialog für geplante Überführung (gleiche ID wie Wandkalender). */
export function wallEntryFromPlanningTransfer(
  fall: Sterbefall,
  card: PlanningCard
): WallCalendarEntry | null {
  if (!card.plannedDayKey) return null;
  const art = transferArt(card.schrittTyp);
  const title = schrittTypLabel(card.schrittTyp || 'ueberfuehrung');
  const route = `${card.vonOrt} → ${card.nachOrt}`;
  return {
    id: `plan:${card.id}`,
    docId: fall.id,
    sterbefallId: fall.sterbefallId ?? fall.id,
    dayKey: card.plannedDayKey,
    dayLabel: formatDayLabelDe(card.plannedDayKey),
    timeLabel: card.plannedZeit || card.terminAm || '—',
    sortMs: 0,
    name: card.name,
    title,
    subtitle: route,
    badges: [title, 'Geplant'],
    grouped: false,
    arts: [art],
    searchText: `${card.name} ${title} ${route} überführung`.toLowerCase(),
  };
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
    return 'Kein Personal nötig';
  }

  const when = ceremony.zeit ? ` um ${ceremony.zeit}` : '';
  return `Bedarf${when}: ${parts.join(' · ')}`;
}

export function planningTransferNeedsLine(card: PlanningCard): string {
  if (card.schrittTyp.trim().toLowerCase() === 'kremation') {
    return 'Kein Personal nötig';
  }
  const when = card.plannedZeit ? ` um ${card.plannedZeit}` : '';
  return `Bedarf${when}: Fahrer`;
}

export function isKremationTransferCard(card: Pick<PlanningCard, 'schrittTyp'>): boolean {
  return card.schrittTyp.trim().toLowerCase() === 'kremation';
}

export function planningCeremonyPersonnelLine(
  booking: PersonnelBooking | null | undefined,
  pool: DispositionPerson[],
  ceremony?: CeremonyInfo
): string | null {
  if (!booking) return null;
  if (
    booking.entryArts.length > 0 &&
    booking.entryArts.every(
      (a) => a === 'ueberfuehrung' || a === 'ueberfuehrung_kremation'
    )
  ) {
    const byId = new Map(pool.map((p) => [p.id, p]));
    const names = booking.traegerIds
      .map((id) => {
        const p = byId.get(id);
        if (!p?.name) return '';
        return p.name;
      })
      .filter(Boolean);
    if (names.length === 0) {
      return booking.note?.trim() || null;
    }
    return names.length === 1 ? `Fahrer ${names[0]}` : `Fahrer: ${names.join(', ')}`;
  }
  const byId = new Map(pool.map((p) => [p.id, p]));
  const parts: string[] = [];
  if (booking.arrangeurId) {
    const p = byId.get(booking.arrangeurId);
    if (p?.name) {
      parts.push(`Arr. ${p.name}`);
    } else {
      parts.push('Arrangeur');
    }
  }
  const traeger = personnelBookingTraegerLine(booking, pool);
  if (traeger) parts.push(traeger);

  const entryLike = ceremony
    ? {
        arts: [kindToArt(ceremony.kind)],
        title: kindTitle(ceremony.kind),
        bestattungsMarker: ceremony.bestattungsMarker ?? booking.bestattungsMarker,
      }
    : {
        arts: booking.entryArts,
        title: booking.entryTitle,
        bestattungsMarker: booking.bestattungsMarker,
      };

  if (isPersonnelBookingIncomplete(entryLike, booking)) {
    parts.push('Personal offen');
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

export function findBookingForPlanningTransfer(
  bookings: Record<string, PersonnelBooking>,
  card: PlanningCard
): PersonnelBooking | null {
  if (!card.plannedDayKey) return null;
  return findBookingForWallEntry(bookings, {
    id: `plan:${card.id}`,
    docId: card.docId,
    dayKey: card.plannedDayKey,
    arts: [transferArt(card.schrittTyp)],
    title: schrittTypLabel(card.schrittTyp || 'ueberfuehrung'),
  });
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
    const needsPersonnel = c.ceremony.kind !== 'kremation';
    const entryLike = {
      arts: [kindToArt(c.ceremony.kind)],
      title: kindTitle(c.ceremony.kind),
      bestattungsMarker: c.ceremony.bestattungsMarker ?? booking?.bestattungsMarker,
    };
    const personnelIncomplete =
      needsPersonnel && isPersonnelBookingIncomplete(entryLike, booking);
    return {
      ...c,
      booking,
      needsPersonnel,
      personnelIncomplete,
      needsLine: planningCeremonyNeedsLine(c.ceremony, booking, pool),
      personnelLine: planningCeremonyPersonnelLine(booking, pool, c.ceremony),
    };
  });
}
