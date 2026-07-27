import {
  effectiveStandbyPeople,
  exclusionTooltip,
  isBereitschaftRelevantDay,
  personAbbrev,
  standbyStaffingWarning,
} from '../board/bereitschaftRules';
import type { DispositionPerson, HolidayRegion } from '../types/dispositionSettings';
import type { PersonnelAbsence, PersonnelStandby } from '../types/personnelBooking';

type Props = {
  dayKey: string;
  standbys: Record<string, PersonnelStandby>;
  absences?: Record<string, PersonnelAbsence>;
  personnelById: Map<string, DispositionPerson>;
  region?: HolidayRegion;
  /** Nur anzeigen wenn Tag relevant (Fr/Sa/So/Feiertag). */
  onlyIfRelevant?: boolean;
  compact?: boolean;
  className?: string;
  onClick?: () => void;
};

export function BereitschaftChips({
  dayKey,
  standbys,
  absences = {},
  personnelById,
  region = 'AT',
  onlyIfRelevant = true,
  compact = false,
  className = '',
  onClick,
}: Props) {
  const relevant = isBereitschaftRelevantDay(dayKey, region);
  if (onlyIfRelevant && !relevant) return null;

  const people = effectiveStandbyPeople(dayKey, standbys, absences);
  const warning = standbyStaffingWarning(people.length);
  const short = people.length < 2;

  if (people.length === 0 && !relevant) return null;

  const classNames = [
    'bereitschaft-chips',
    compact ? 'is-compact' : '',
    short ? 'is-short' : '',
    people.length === 0 ? 'is-empty' : '',
    onClick ? 'is-clickable' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const title =
    people.length === 0
      ? 'Bereitschaft noch offen (mind. 2 empfohlen)'
      : warning ?? undefined;

  const content = (
    <>
      <span className="bereitschaft-chips-label">{compact ? 'B' : 'Bereitschaft'}</span>
      {people.length === 0 ? (
        <span className="bereitschaft-chips-empty">?</span>
      ) : (
        people.map((p) => {
          const name = personnelById.get(p.personId)?.name ?? p.personId;
          const excl = exclusionTooltip(p.exclusions);
          const tip = [name, excl, p.absentPartial ? 'teilweise abwesend' : null]
            .filter(Boolean)
            .join(' · ');
          return (
            <span key={`${p.standbyId}-${p.personId}`} className="bereitschaft-chip" title={tip}>
              {personAbbrev(name)}
            </span>
          );
        })
      )}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={classNames} onClick={onClick} title={title}>
        {content}
      </button>
    );
  }

  return (
    <div className={classNames} title={title}>
      {content}
    </div>
  );
}
