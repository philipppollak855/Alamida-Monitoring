import {
  absenceTooltip,
  listAbsencesForDay,
  personAbbrev,
} from '../board/bereitschaftRules';
import type { DispositionPerson } from '../types/dispositionSettings';
import type { PersonnelAbsence } from '../types/personnelBooking';

type Props = {
  dayKey: string;
  absences: Record<string, PersonnelAbsence>;
  personnelById: Map<string, DispositionPerson>;
  compact?: boolean;
  className?: string;
  onClick?: () => void;
};

export function AbsenceChips({
  dayKey,
  absences,
  personnelById,
  compact = false,
  className = '',
  onClick,
}: Props) {
  const people = listAbsencesForDay(absences, dayKey);
  if (people.length === 0) return null;

  const classNames = [
    'absence-chips',
    compact ? 'is-compact' : '',
    onClick ? 'is-clickable' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const title = `${people.length} Abwesenheit${people.length === 1 ? '' : 'en'}`;

  const content = (
    <>
      <span className="absence-chips-label">{compact ? 'A' : 'Abwesend'}</span>
      {people.map((p) => {
        const name = personnelById.get(p.personId)?.name ?? p.personId;
        return (
          <span
            key={`${p.absenceId}-${p.personId}`}
            className={`absence-chip${p.partial ? ' is-partial' : ''}`}
            title={absenceTooltip(name, p)}
          >
            {personAbbrev(name)}
          </span>
        );
      })}
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
