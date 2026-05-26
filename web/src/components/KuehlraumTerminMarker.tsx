import { useMemo } from 'react';
import type { Sterbefall } from '../types';
import { buildKuehlraumTerminMarker } from '../board/kuehlraumTerminMarker';

interface Props {
  fall: Sterbefall;
  now?: Date;
  className?: string;
}

export function KuehlraumTerminMarker({ fall, now, className }: Props) {
  const marker = useMemo(
    () => buildKuehlraumTerminMarker(fall, now ?? new Date()),
    [fall, now]
  );

  if (!marker) return null;

  const cls = [
    'cool-termin-marker',
    `cool-termin-marker--${marker.kind}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={cls} title={marker.label}>
      {marker.label}
    </span>
  );
}
