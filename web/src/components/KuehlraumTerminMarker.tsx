import { useMemo } from 'react';
import type { Sterbefall } from '../types';
import { buildKuehlraumTerminMarkers } from '../board/kuehlraumTerminMarker';
import { WallCalBestattungsBadge } from './WallCalBestattungsBadge';

interface Props {
  fall: Sterbefall;
  now?: Date;
  className?: string;
}

export function KuehlraumTerminMarker({ fall, now, className }: Props) {
  const markers = useMemo(
    () => buildKuehlraumTerminMarkers(fall, now ?? new Date()),
    [fall, now]
  );

  if (markers.length === 0) return null;

  return (
    <span className={['cool-termin-markers', className].filter(Boolean).join(' ')}>
      {markers.map((marker) => (
        <span
          key={`${marker.kind}-${marker.datum || marker.label}`}
          className={`cool-termin-marker cool-termin-marker--${marker.kind}`}
          title={marker.label}
        >
          {marker.bestattungsMarker ? (
            <WallCalBestattungsBadge marker={marker.bestattungsMarker} />
          ) : null}
          <span className="cool-termin-marker-text">{marker.label}</span>
        </span>
      ))}
    </span>
  );
}
