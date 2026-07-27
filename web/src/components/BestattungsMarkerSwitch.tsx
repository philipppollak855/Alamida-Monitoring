import type { BestattungsMarker } from '../board/feierterminLogic';

type Props = {
  /** Manuelle Überschreibung; null = Automatik. */
  override: BestattungsMarker | null;
  /** Effektiver Marker (Override oder Automatik). */
  effective: BestattungsMarker;
  pending?: boolean;
  disabled?: boolean;
  onChange: (next: BestattungsMarker | null) => void;
};

export function BestattungsMarkerSwitch({
  override,
  effective,
  pending,
  disabled,
  onChange,
}: Props) {
  const isManual = override === 'S' || override === 'U';

  return (
    <div className="bestattungs-marker-switch" role="group" aria-label="Sarg oder Urne">
      <span className="bestattungs-marker-switch-label">
        Bestattung
        {isManual ? ' (manuell)' : ' (auto)'}
      </span>
      <div className="bestattungs-marker-switch-btns">
        <button
          type="button"
          className={`bestattungs-marker-switch-btn is-S${effective === 'S' ? ' is-active' : ''}${
            override === 'S' ? ' is-manual' : ''
          }`}
          disabled={disabled || pending}
          aria-pressed={effective === 'S'}
          title="Sarg — manuell setzen (überschreibt Automatik)"
          onClick={() => onChange(override === 'S' ? null : 'S')}
        >
          Sarg
        </button>
        <button
          type="button"
          className={`bestattungs-marker-switch-btn is-U${effective === 'U' ? ' is-active' : ''}${
            override === 'U' ? ' is-manual' : ''
          }`}
          disabled={disabled || pending}
          aria-pressed={effective === 'U'}
          title="Urne — manuell setzen (überschreibt Automatik)"
          onClick={() => onChange(override === 'U' ? null : 'U')}
        >
          Urne
        </button>
      </div>
      {isManual && (
        <button
          type="button"
          className="bestattungs-marker-switch-reset"
          disabled={disabled || pending}
          onClick={() => onChange(null)}
          title="Automatische S/U-Erkennung wiederherstellen"
        >
          Auto
        </button>
      )}
    </div>
  );
}
