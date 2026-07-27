import { useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Sterbefall } from '../types';
import {
  findFallDuplikatGruppen,
  isNeuDokumentId,
  type FallDuplikatGruppe,
} from '../board/fallDuplikate';
import { istInHistory } from '../board/historieLogic';
import { fallAbschlussGrundLabel } from '../board/fallAbschluss';

type Props = {
  open: boolean;
  sterbefaelle: Sterbefall[];
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onRemove: (docIds: string[]) => void | Promise<void>;
};

function fallTitle(s: Sterbefall): string {
  return s.verstorbenerName?.trim() || s.sterbefallId || s.id;
}

export function FallDuplikateDialog({
  open,
  sterbefaelle,
  pending,
  error,
  onClose,
  onRemove,
}: Props) {
  const titleId = useId();
  const groups = useMemo(() => findFallDuplikatGruppen(sterbefaelle), [sterbefaelle]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!open) return;
    const next = new Set<string>();
    for (const g of groups) for (const id of g.removeIds) next.add(id);
    setSelected(next);
  }, [open, groups]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, pending]);

  if (!open) return null;

  const selectedCount = selected.size;

  const toggle = (id: string, keepId: string) => {
    if (id === keepId) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectRecommended = () => {
    const next = new Set<string>();
    for (const g of groups) for (const id of g.removeIds) next.add(id);
    setSelected(next);
  };

  return createPortal(
    <div
      className="fall-dup-backdrop"
      role="presentation"
      onClick={() => {
        if (!pending) onClose();
      }}
    >
      <div
        className="fall-dup-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="fall-dup-head">
          <div>
            <p className="fall-dup-kicker">Fälle</p>
            <h2 id={titleId}>Duplikatsprüfung</h2>
            <p className="fall-dup-sub">
              Aktive Fälle mit gleichem Namen (auch bei vertauschter Vor-/Nachnamen-Reihenfolge).
              Entfernte Duplikate verschwinden aus Disposition und Wandmonitor; Personal- und
              Überführungsplanungen bleiben am behaltenen Fall.
            </p>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={pending}>
            Schließen
          </button>
        </header>

        <div className="fall-dup-toolbar">
          <span>
            {groups.length === 0
              ? 'Keine Duplikate gefunden'
              : `${groups.length} Gruppe${groups.length === 1 ? '' : 'n'} · ${selectedCount} zum Entfernen`}
          </span>
          {groups.length > 0 && (
            <button
              type="button"
              className="btn-ghost btn-small"
              disabled={pending}
              onClick={selectRecommended}
            >
              Empfehlung wählen
            </button>
          )}
        </div>

        {error && (
          <p className="board-inline-error" role="alert">
            {error}
          </p>
        )}

        <div className="fall-dup-list">
          {groups.map((g) => (
            <DuplikatGruppeCard
              key={g.key}
              group={g}
              selected={selected}
              pending={pending}
              onToggle={toggle}
            />
          ))}
        </div>

        <footer className="fall-dup-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={pending}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={pending || selectedCount === 0}
            onClick={() => void onRemove([...selected])}
          >
            {pending
              ? 'Entfernen…'
              : selectedCount === 0
                ? 'Nichts ausgewählt'
                : `${selectedCount} Duplikat${selectedCount === 1 ? '' : 'e'} entfernen`}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}

function DuplikatGruppeCard({
  group,
  selected,
  pending,
  onToggle,
}: {
  group: FallDuplikatGruppe;
  selected: Set<string>;
  pending?: boolean;
  onToggle: (id: string, keepId: string) => void;
}) {
  return (
    <section className="fall-dup-group">
      <header className="fall-dup-group-head">
        <strong>{group.label}</strong>
        <span>{group.faelle.length} Einträge</span>
      </header>
      <ul className="fall-dup-items">
        {group.faelle.map((s) => {
          const isKeep = s.id === group.keepId;
          const checked = selected.has(s.id);
          const archived = istInHistory(s);
          return (
            <li
              key={s.id}
              className={`fall-dup-item${isKeep ? ' is-keep' : ''}${checked ? ' is-remove' : ''}`}
            >
              <label>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={pending || isKeep}
                  onChange={() => onToggle(s.id, group.keepId)}
                  title={isKeep ? 'Empfohlen behalten' : 'Zum Entfernen markieren'}
                />
                <span className="fall-dup-item-main">
                  <strong>{fallTitle(s)}</strong>
                  <span className="fall-dup-item-meta">
                    {s.sterbefallId || s.id}
                    {isNeuDokumentId(s.id) ? ' · NEU-Dokument' : ''}
                    {s.sterbedatum ? ` · † ${s.sterbedatum}` : ''}
                    {s.aktuellePosition ? ` · ${s.aktuellePosition}` : ''}
                    {archived
                      ? ` · ${fallAbschlussGrundLabel(s.historieGrund ?? s.abschlussGrund)}`
                      : ' · aktiv'}
                  </span>
                </span>
              </label>
              {isKeep && <span className="fall-dup-badge keep">Behalten</span>}
              {!isKeep && checked && <span className="fall-dup-badge remove">Entfernen</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
