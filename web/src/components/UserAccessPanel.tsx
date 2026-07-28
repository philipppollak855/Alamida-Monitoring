import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  FULL_WALL_TABS,
  permissionsForPreset,
  resolveAccessPermissions,
  type AppAccessPermissions,
  type AccessPermissionPreset,
} from '../auth/permissions';
import { useDispositionSettings } from '../settings/SettingsProvider';
import { normalizeDispositionSettings } from '../settings/settingsNormalize';
import {
  applyPersonUserLink,
  subscribeManagedUsers,
  updateManagedUser,
  type ManagedUser,
} from '../services/userAdmin';
import type { DispositionPerson } from '../types/dispositionSettings';

const WALL_TAB_LABELS: { id: keyof typeof FULL_WALL_TABS; label: string }[] = [
  { id: 'kuehlraum', label: 'Kühlraum' },
  { id: 'extern', label: 'Extern' },
  { id: 'kalender', label: 'Kalender' },
  { id: 'abholungen', label: 'Heute' },
  { id: 'offen', label: 'Offen' },
];

function PermissionToggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="user-access-toggle" title={hint}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function UserAccessEditor({
  user,
  pool,
  busy,
  onSave,
}: {
  user: ManagedUser;
  pool: DispositionPerson[];
  busy: boolean;
  onSave: (patch: {
    activated: boolean;
    linkedPersonId: string | null;
    permissions: AppAccessPermissions;
  }) => Promise<void>;
}) {
  const [activated, setActivated] = useState(user.activated === true);
  const [linkedPersonId, setLinkedPersonId] = useState(user.linkedPersonId ?? '');
  const [permissions, setPermissions] = useState(() =>
    resolveAccessPermissions(user.permissions)
  );
  const [expanded, setExpanded] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setActivated(user.activated === true);
    setLinkedPersonId(user.linkedPersonId ?? '');
    setPermissions(resolveAccessPermissions(user.permissions));
    setLocalError(null);
  }, [user]);

  const applyPreset = (preset: AccessPermissionPreset) => {
    setPermissions(permissionsForPreset(preset));
    setExpanded(true);
  };

  const patchPerm = <K extends keyof AppAccessPermissions>(
    key: K,
    value: AppAccessPermissions[K]
  ) => {
    setPermissions((p) => ({ ...p, [key]: value }));
  };

  const handleSave = async () => {
    setLocalError(null);
    try {
      await onSave({
        activated,
        linkedPersonId: linkedPersonId.trim() || null,
        permissions,
      });
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    }
  };

  return (
    <article className={`user-access-card ${activated ? 'is-activated' : 'is-pending'}`}>
      <header className="user-access-card-head">
        <div>
          <strong>{user.displayName || user.email || user.uid}</strong>
          {user.displayName && user.email && (
            <span className="user-access-email">{user.email}</span>
          )}
          <span className={`user-access-badge ${activated ? 'ok' : 'wait'}`}>
            {activated ? 'Freigeschaltet' : 'Wartend'}
          </span>
        </div>
        <label className="user-access-toggle">
          <input
            type="checkbox"
            checked={activated}
            disabled={busy}
            onChange={(e) => setActivated(e.target.checked)}
          />
          <span>Zugriff aktiv</span>
        </label>
      </header>

      <div className="user-access-row">
        <label className="user-access-field">
          <span>Personal verknüpfen</span>
          <select
            value={linkedPersonId}
            disabled={busy}
            onChange={(e) => setLinkedPersonId(e.target.value)}
          >
            <option value="">— kein Personal —</option>
            {pool.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.linkedUserId && p.linkedUserId !== user.uid ? ' (bereits verknüpft)' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="user-access-presets">
          <button
            type="button"
            className="btn-ghost btn-small"
            disabled={busy}
            onClick={() => applyPreset('full')}
          >
            Vollzugriff
          </button>
          <button
            type="button"
            className="btn-ghost btn-small"
            disabled={busy}
            onClick={() => applyPreset('staffOwn')}
          >
            Nur eigene Termine
          </button>
        </div>
      </div>

      <button
        type="button"
        className="btn-ghost btn-small user-access-expand"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? 'Rechte ausblenden' : 'Rechte im Detail'}
      </button>

      {expanded && (
        <div className="user-access-details">
          <fieldset className="user-access-fieldset">
            <legend>Sicht</legend>
            <label className="user-access-field">
              <span>Termine / Kalender</span>
              <select
                value={permissions.calendarScope}
                onChange={(e) =>
                  patchPerm('calendarScope', e.target.value === 'own' ? 'own' : 'all')
                }
              >
                <option value="all">Alles sehen</option>
                <option value="own">Nur eigene Einbuchungen</option>
              </select>
            </label>
          </fieldset>

          <fieldset className="user-access-fieldset">
            <legend>Bereiche</legend>
            <PermissionToggle
              label="Disposition"
              checked={permissions.canDisposition}
              onChange={(v) => patchPerm('canDisposition', v)}
            />
            <PermissionToggle
              label="Planung"
              checked={permissions.canPlan}
              onChange={(v) => patchPerm('canPlan', v)}
            />
            <PermissionToggle
              label="Wandmonitor"
              checked={permissions.canWall}
              onChange={(v) => patchPerm('canWall', v)}
            />
            <PermissionToggle
              label="Widgets"
              checked={permissions.canWidgets}
              onChange={(v) => patchPerm('canWidgets', v)}
            />
          </fieldset>

          {permissions.canWall && (
            <fieldset className="user-access-fieldset">
              <legend>Wand-Tabs</legend>
              {WALL_TAB_LABELS.map((tab) => (
                <PermissionToggle
                  key={tab.id}
                  label={tab.label}
                  checked={permissions.wallTabs[tab.id]}
                  onChange={(v) =>
                    patchPerm('wallTabs', { ...permissions.wallTabs, [tab.id]: v })
                  }
                />
              ))}
            </fieldset>
          )}

          <fieldset className="user-access-fieldset">
            <legend>Aktionen</legend>
            <PermissionToggle
              label="Personal für andere einbuchen"
              checked={permissions.canBookPersonnel}
              onChange={(v) => patchPerm('canBookPersonnel', v)}
            />
            <PermissionToggle
              label="Eigene Einbuchung bestätigen"
              checked={permissions.canSelfConfirm}
              onChange={(v) => patchPerm('canSelfConfirm', v)}
              hint="Nur wenn mit Personal verknüpft"
            />
            <PermissionToggle
              label="In Bereitschaft eintragen"
              checked={permissions.canSelfStandby}
              onChange={(v) => patchPerm('canSelfStandby', v)}
            />
            <PermissionToggle
              label="Fälle löschen / abschließen"
              checked={permissions.canDeleteCases}
              onChange={(v) => patchPerm('canDeleteCases', v)}
            />
            <PermissionToggle
              label="Einstellungen bearbeiten"
              checked={permissions.canManageSettings}
              onChange={(v) => patchPerm('canManageSettings', v)}
            />
            <PermissionToggle
              label="Benutzer verwalten"
              checked={permissions.canManageUsers}
              onChange={(v) => patchPerm('canManageUsers', v)}
              hint="Kann andere freischalten und Rechte setzen"
            />
          </fieldset>
        </div>
      )}

      {localError && <p className="settings-error">{localError}</p>}

      <div className="user-access-actions">
        <button
          type="button"
          className="btn-primary btn-small"
          disabled={busy}
          onClick={() => void handleSave()}
        >
          {busy ? 'Speichert…' : 'Benutzer speichern'}
        </button>
        <button
          type="button"
          className="btn-ghost btn-small"
          disabled={busy}
          onClick={() => {
            setActivated(user.activated === true);
            setLinkedPersonId(user.linkedPersonId ?? '');
            setPermissions(resolveAccessPermissions(user.permissions));
            setLocalError(null);
          }}
        >
          Verwerfen
        </button>
      </div>
    </article>
  );
}

export function UserAccessPanel({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const { user: me, refreshProfile } = useAuth();
  const { settings, saveSettings } = useDispositionSettings();
  const [open, setOpen] = useState(defaultOpen);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'activated'>('all');

  const pool = useMemo(
    () => normalizeDispositionSettings(settings).personnelPool ?? [],
    [settings]
  );

  useEffect(() => {
    if (!open) return;
    return subscribeManagedUsers(setUsers, setLoadError);
  }, [open]);

  const visible = useMemo(() => {
    if (filter === 'pending') return users.filter((u) => !u.activated);
    if (filter === 'activated') return users.filter((u) => u.activated);
    return users;
  }, [users, filter]);

  const pendingCount = users.filter((u) => !u.activated).length;

  const handleSave = async (
    target: ManagedUser,
    patch: {
      activated: boolean;
      linkedPersonId: string | null;
      permissions: AppAccessPermissions;
    }
  ) => {
    setBusyUid(target.uid);
    try {
      const nextPool = applyPersonUserLink(pool, {
        userId: target.uid,
        userEmail: target.email || '',
        personId: patch.linkedPersonId,
      });
      const poolChanged =
        JSON.stringify(nextPool.map((p) => [p.id, p.linkedUserId ?? ''])) !==
        JSON.stringify(pool.map((p) => [p.id, p.linkedUserId ?? '']));

      await updateManagedUser(target.uid, {
        activated: patch.activated,
        linkedPersonId: patch.linkedPersonId,
        permissions: patch.permissions,
      });

      if (poolChanged) {
        await saveSettings({
          ...normalizeDispositionSettings(settings),
          personnelPool: nextPool,
        });
      }

      if (me?.uid === target.uid) {
        await refreshProfile();
      }
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <section className="panel settings-panel user-access-panel">
      <button
        type="button"
        className="settings-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>
          Benutzer &amp; Rechte
          {pendingCount > 0 ? ` (${pendingCount} wartend)` : ''}
        </span>
        <span aria-hidden>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="settings-body">
          <p className="settings-hint">
            Hier Konten freischalten, mit dem Personalpool verknüpfen und festlegen, ob jemand
            alles sieht oder nur Termine, in die er eingebucht ist — inkl. Tabs und Aktionen
            (Planen, Disposition, Fälle löschen, Selbstbestätigung).
          </p>
          <p className="settings-hint">
            Erster Admin: In Firebase Console beim eigenen <code>users</code>-Dokument
            <code> permissions.canManageUsers: true </code> und <code>activated: true</code>{' '}
            setzen. Danach kann die Verwaltung hier erfolgen.
          </p>

          <div className="user-access-toolbar">
            <div className="board-toolbar-chips" role="tablist" aria-label="Benutzerfilter">
              {(
                [
                  ['all', 'Alle'],
                  ['pending', 'Wartend'],
                  ['activated', 'Aktiv'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={filter === id}
                  className={`board-toolbar-chip ${filter === id ? 'active' : ''}`}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="settings-count">{visible.length} Benutzer</span>
          </div>

          {loadError && <p className="settings-error">{loadError}</p>}

          {visible.length === 0 && !loadError && (
            <p className="muted">Keine Benutzer in dieser Ansicht.</p>
          )}

          <div className="user-access-list">
            {visible.map((u) => (
              <UserAccessEditor
                key={u.uid}
                user={u}
                pool={pool}
                busy={busyUid === u.uid}
                onSave={(patch) => handleSave(u, patch)}
              />
            ))}
          </div>

          {!users.some((u) => resolveAccessPermissions(u.permissions).canManageUsers) && (
            <p className="settings-error">
              Noch kein Benutzer mit „Benutzer verwalten“. Bitte einmalig in der Firebase Console
              setzen (siehe Hinweis oben) — sonst bleibt dieses Panel nur lesbar, speichern
              schlägt fehl.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
