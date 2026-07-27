import type { SterbeortPoolItem } from '../../planning/types';

type Props = {
  item: SterbeortPoolItem;
  dragging?: boolean;
  onDragStart: (item: SterbeortPoolItem) => void;
  onDragEnd: () => void;
};

export function PlanningSterbeortCard({ item, dragging, onDragStart, onDragEnd }: Props) {
  return (
    <article
      className={`plan-sterbeort-card${dragging ? ' is-dragging' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.docId);
        e.dataTransfer.setData('application/x-plan-kind', 'sterbeort');
        onDragStart(item);
      }}
      onDragEnd={onDragEnd}
    >
      <div className="plan-sterbeort-top">
        <span className="plan-card-grip" aria-hidden>
          ⠿
        </span>
        <span className="plan-sterbeort-badge">Sterbeort</span>
      </div>
      <strong className="plan-sterbeort-name">{item.name}</strong>
      <span className="plan-sterbeort-id">{item.sterbefallId}</span>
      <span className="plan-sterbeort-ort">{item.vonOrt}</span>
      <p className="plan-sterbeort-hint">Auf Kühlraum-Tag ziehen → Termin eingeben</p>
    </article>
  );
}
