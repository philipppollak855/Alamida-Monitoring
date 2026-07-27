import type { CeremonyInfo } from '../planning/types';
import type { Sterbefall } from '../types';
import type { DispositionPerson } from '../types/dispositionSettings';
import type { PersonnelBooking } from '../types/personnelBooking';
import type { CalendarTerminArt, WallCalendarEntry } from '../board/wallCalendar';
import { formatDayLabelDe } from '../board/dateUtils';
import {
  ceremonyBookingId,
  findBookingForCeremony,
  isBegraebnisEntry,
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
    parts.push('Fahrer / Überführung');
  }

  const when = ceremony.zeit ? ` um ${ceremony.zeit}` : '';
  return `Bedarf${when}: ${parts.join(' · ')}`;
}

export function planningCeremonyPersonnelLine(
  booking: PersonnelBooking | null | undefined,
  pool: DispositionPerson[]
): string | null {
  if (!booking) return null;
  const byId = new Map(pool.map((p) => [p.id, p.name]));
  const parts: string[] = [];
  if (booking.arrangeurId) {
    const name = byId.get(booking.arrangeurId);
    parts.push(name ? `Arr. ${name}` : 'Arrangeur');
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
