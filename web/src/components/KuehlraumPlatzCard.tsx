import { EndzielChip } from '../ui/SchrittBadge';
import { KuehlraumTerminMarker } from './KuehlraumTerminMarker';
import { istFreigabeWirksam } from '../board/freigabeLogic';
import type { Sterbefall } from '../types';

interface Props {
  platzNr: number;
  fall: Sterbefall;
  now: Date;
  expanded?: boolean;
  pending?: boolean;
  onToggleExpand?: () => void;
  onAbschliessen: () => void;
}

export function KuehlraumPlatzCard({
  platzNr,
  fall,
  now,
  expanded,
  pending,
  onToggleExpand,
  onAbschliessen,
}: Props) {
  const name = fall.verstorbenerName || fall.sterbefallId || fall.id;
  const nextNach = fall.naechsterSchrittNach ?? fall.naechsteUeberfuehrungNach;
  const nextAm = fall.naechsterSchrittAm ?? fall.naechsteUeberfuehrungAm;
  const freigabeWirksam = istFreigabeWirksam(fall.freigabeFrei, fall.freigabeDatum, now);

  return (
    <article
      className={`kr-platz-card ${expanded ? 'expanded' : ''} ${
        freigabeWirksam ? 'has-freigabe' : fall.freigabeFrei ? 'has-freigabe-geplant' : ''
      }`}
    >
      <div className="kr-platz-top">
        <span className="kr-platz-nr">Platz {platzNr}</span>
        {fall.sterbefallId && <span className="kr-platz-id">#{fall.sterbefallId}</span>}
        {fall.freigabeFrei && fall.freigabeDatum && (
          <span
            className={`kr-platz-freigabe ${freigabeWirksam ? 'wirksam' : 'geplant'}`}
            title="Freigabe"
          >
            {freigabeWirksam ? 'Frei' : `Frei ab ${fall.freigabeDatum}`}
          </span>
        )}
      </div>

      <button
        type="button"
        className="kr-platz-main"
        onClick={onToggleExpand}
        aria-expanded={expanded}
      >
        <span className="kr-platz-name">{name}</span>
        {fall.aktuellePosition && (
          <span className="kr-platz-pos">{fall.aktuellePosition}</span>
        )}
        {fall.endziel && (
          <EndzielChip typ={fall.endzielTyp} ort={fall.endziel} />
        )}
      </button>

      <KuehlraumTerminMarker fall={fall} now={now} className="kr-platz-termin" />

      {nextNach && (
        <p className="kr-platz-next">
          <span className="kr-platz-next-label">Nächster Schritt</span>
          <span className="kr-platz-next-route">
            {nextAm && <time>{nextAm}</time>}
            <span>→ {nextNach}</span>
          </span>
        </p>
      )}

      {expanded && (fall.verlauf?.length ?? 0) > 0 && (
        <ul className="kr-platz-verlauf">
          {(fall.verlauf ?? []).slice(-3).map((v) => (
            <li key={v.nummer}>
              <time>{v.terminAm ?? v.abholungAm}</time>
              <span>
                {v.vonOrt && v.nachOrt ? `${v.vonOrt} → ${v.nachOrt}` : v.ort}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="kr-platz-actions">
        <button
          type="button"
          className="kr-platz-abschluss"
          disabled={pending}
          onClick={onAbschliessen}
        >
          {pending ? '…' : 'Abschließen'}
        </button>
        {onToggleExpand && (
          <button
            type="button"
            className="kr-platz-details"
            onClick={onToggleExpand}
            aria-expanded={expanded}
          >
            {expanded ? 'Weniger' : 'Details'}
          </button>
        )}
      </div>
    </article>
  );
}
