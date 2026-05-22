import type { UrnenEintrag } from '../board/urnenLogic';

type Props = {
  liste: UrnenEintrag[];
  pendingDocId: string | null;
  onUndo: (docId: string) => void;
  variant?: 'wall' | 'board';
};

export function UrnenBereichPanel({
  liste,
  pendingDocId,
  onUndo,
  variant = 'board',
}: Props) {
  if (liste.length === 0) return null;

  const isWall = variant === 'wall';

  return (
    <section
      className={isWall ? 'wall-urnen-section' : 'panel board-urnen-panel'}
      aria-label="Urnen"
    >
      {isWall ? (
        <>
          <h3 className="wall-urnen-title">Urnen</h3>
          <p className="wall-urnen-sub">Retour aus Kremation</p>
        </>
      ) : (
        <div className="panel-head compact">
          <div>
            <h2>Urnen</h2>
            <p>{liste.length} Retour aus Kremation</p>
          </div>
        </div>
      )}

      <ul className={isWall ? 'wall-urnen-list' : 'board-urnen-list'}>
        {liste.map((u) => (
          <li
            key={u.docId}
            className={isWall ? 'wall-urnen-item' : 'board-urnen-item'}
          >
            <div className={isWall ? 'wall-urnen-item-main' : 'board-urnen-item-main'}>
              <span className={isWall ? 'wall-urnen-name' : 'board-urnen-name'}>
                {u.name}
              </span>
              {u.retourVon && (
                <span className={isWall ? 'wall-urnen-meta' : 'board-urnen-meta'}>
                  von {u.retourVon}
                </span>
              )}
            </div>
            <button
              type="button"
              className="urnen-undo-btn"
              disabled={pendingDocId === u.docId}
              title="Zurück nach Extern/Kremation"
              onClick={() => onUndo(u.docId)}
            >
              {pendingDocId === u.docId ? '…' : 'Rückgängig'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
