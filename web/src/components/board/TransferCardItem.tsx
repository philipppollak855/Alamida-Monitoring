import type { OffeneUeberfuehrungRow } from '../../board/boardUtils';
import { EndzielChip, SchrittBadge, StatusChip } from '../../ui/SchrittBadge';
import { RouteFlow } from '../../ui/RouteFlow';

export function TransferCardItem({ row }: { row: OffeneUeberfuehrungRow }) {
  return (
    <article
      className={`transfer-card transfer-${row.schrittTyp} status-${row.status}`}
    >
      <div className="transfer-card-top">
        <time className="transfer-date">{row.terminAm}</time>
        <SchrittBadge typ={row.schrittTyp} />
        <StatusChip
          status={row.istAbholungVomSterbeort ? 'abholung_noetig' : row.status}
          highlight={row.status === 'heute'}
        />
      </div>
      <div className="transfer-person">
        <span className="transfer-name">{row.name}</span>
        <span className="transfer-id">{row.sterbefallId}</span>
      </div>
      <RouteFlow von={row.vonOrt} nach={row.nachOrt} />
      <div className="transfer-card-foot">
        <EndzielChip typ={row.endzielTyp} ort={row.endziel} />
        {(row.schrittTyp === 'abholung' || row.istAbholungVomSterbeort) &&
          row.abholortIstKrankenhaus && (
            <span className="chip chip-muted">Krankenhaus</span>
          )}
      </div>
    </article>
  );
}
