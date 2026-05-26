import { useFirestoreCollection } from '../hooks/useFirestoreCollection';
import { LiveIndicator } from './LiveIndicator';
import type { Sterbefall } from '../types';

/** Gemeinsame Live-Leiste für Board und Wandmonitor. */
export function LiveDataBar({ compact = false }: { compact?: boolean }) {
  const sterbefaelle = useFirestoreCollection<Sterbefall>('sterbefaelle', 'lastSeenAt');
  const { lastSyncAt, isLive, loading, error } = sterbefaelle;
  const aktiv = sterbefaelle.items.filter((s) => s.aktivInAlamida).length;

  return (
    <div className={`live-data-bar ${compact ? 'compact' : ''}`}>
      <LiveIndicator isLive={isLive} lastSyncAt={lastSyncAt} loading={loading} />
      {!compact && (
        <span className="live-meta muted">
          Echtzeit · Agent-Updates ohne Reload
        </span>
      )}
      {isLive && (
        <span className="live-meta small">
          {sterbefaelle.items.length > 0
            ? `${sterbefaelle.items.length} Fälle${aktiv > 0 ? ` · ${aktiv} aktiv in Alamida` : ''}`
            : 'Verbunden — warte auf Agent-Sync'}
        </span>
      )}
      {error && <span className="live-error small">{error}</span>}
    </div>
  );
}
