import type { Sterbefall } from '../types';
import { istFehlerhafterPlatzhalterFall, istInHistory } from './historieLogic';
import { istManuellAusgeschlossen } from './fallAbschluss';

export type FallDuplikatGruppe = {
  key: string;
  label: string;
  faelle: Sterbefall[];
  /** Empfohlener behaltener Fall */
  keepId: string;
  /** Empfohlen zu entfernen */
  removeIds: string[];
};

function normalizeToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9äöüß-]/gi, '');
}

/**
 * Kanonischer Namensschlüssel: Tokens sortiert, damit
 * „Anna Meier“ und „Meier Anna“ / „Meier, Anna“ gleich sind.
 */
export function normalizeNameKey(raw?: string): string {
  const tokens = (raw ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[,;|/]+/g, ' ')
    .replace(/[^a-z0-9äöüß\s-]/gi, ' ')
    .split(/\s+/)
    .map((t) => normalizeToken(t))
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return '';
  return [...tokens].sort((a, b) => a.localeCompare(b, 'de')).join(' ');
}

export function displayName(s: Sterbefall): string {
  return (
    s.verstorbenerName?.trim() ||
    [s.verstorbenerVorname, s.verstorbenerNachname].filter(Boolean).join(' ').trim() ||
    s.sterbefallId ||
    s.id
  );
}

/** Name-Key aus Anzeigename oder strukturierten Vor-/Nachnamen. */
export function fallNameMatchKey(s: Sterbefall): string {
  const fromParts = [s.verstorbenerVorname, s.verstorbenerNachname]
    .filter(Boolean)
    .join(' ')
    .trim();
  const fromDisplay = s.verstorbenerName?.trim() || '';
  // Beide Quellen prüfen — sortierte Tokens machen Reihenfolge egal.
  const keys = [normalizeNameKey(fromDisplay), normalizeNameKey(fromParts)].filter(
    (k) => k.length >= 3
  );
  if (keys.length === 0) {
    return normalizeNameKey(displayName(s));
  }
  // Längsten Key bevorzugen (mehr Tokens = präziser)
  return keys.sort((a, b) => b.length - a.length || a.localeCompare(b, 'de'))[0]!;
}

export function isNeuDokumentId(id?: string): boolean {
  return /^NEU-/i.test((id ?? '').trim());
}

export function isWahrscheinlichEchteSterbefallId(id?: string): boolean {
  const t = (id ?? '').trim();
  if (!t || isNeuDokumentId(t)) return false;
  // typische Alamida-Nummern: Ziffern, optional Bindestriche
  return /^[0-9][0-9A-Za-z._-]{2,}$/.test(t);
}

function sterbedatumKey(s: Sterbefall): string {
  const m = (s.sterbedatum ?? '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return '';
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** Je höher, desto eher behalten. */
export function fallDuplikatKeepScore(s: Sterbefall): number {
  let score = 0;
  const id = s.sterbefallId ?? s.id;
  if (isWahrscheinlichEchteSterbefallId(id)) score += 100;
  if (!isNeuDokumentId(s.id)) score += 40;
  if (!isNeuDokumentId(s.sterbefallId)) score += 20;
  if (s.inHistory !== true && s.aktivInDisposition !== false) score += 15;
  if ((s.verlauf?.length ?? 0) > 0) score += Math.min(20, (s.verlauf?.length ?? 0) * 4);
  if ((s.ausstehend?.length ?? 0) > 0) score += 8;
  if (s.aktuellePosition?.trim()) score += 6;
  if (s.kuehlplatz?.trim() || s.kuehlplatzDisposition?.trim()) score += 10;
  if (s.freigabeFrei) score += 5;
  if (s.beisetzungsdatum?.trim() || s.trauerfeierdatum?.trim()) score += 5;
  if (s.lastSeenAt?.seconds) score += Math.min(10, Math.floor(s.lastSeenAt.seconds / 1_000_000_000));
  // Neuere lastSeen leicht bevorzugen
  if (s.lastSeenAt?.seconds) score += Math.min(25, s.lastSeenAt.seconds / 1e8);
  return score;
}

export function preferierterFall(faelle: Sterbefall[]): Sterbefall {
  return [...faelle].sort((a, b) => {
    const ds = fallDuplikatKeepScore(b) - fallDuplikatKeepScore(a);
    if (ds !== 0) return ds;
    return (a.sterbefallId || a.id).localeCompare(b.sterbefallId || b.id, 'de');
  })[0]!;
}

function isEligibleForDuplikatScan(s: Sterbefall): boolean {
  if (istFehlerhafterPlatzhalterFall(s)) return false;
  if (istManuellAusgeschlossen(s.historieGrund ?? s.abschlussGrund)) return false;
  return true;
}

/**
 * Findet Duplikat-Gruppen (gleicher Name; optional gleiches Sterbedatum).
 * Vor-/Nachname-Reihenfolge ist egal („Anna Meier“ = „Meier Anna“).
 * Bereits manuell ausgeschlossene Fälle werden ignoriert.
 */
export function findFallDuplikatGruppen(sterbefaelle: Sterbefall[]): FallDuplikatGruppe[] {
  const candidates = sterbefaelle.filter(isEligibleForDuplikatScan);
  const buckets = new Map<string, Sterbefall[]>();

  for (const s of candidates) {
    const nameKey = fallNameMatchKey(s);
    if (nameKey.length < 3) continue;
    const dateKey = sterbedatumKey(s);
    const key = dateKey ? `${nameKey}|${dateKey}` : `name:${nameKey}`;
    const list = buckets.get(key) ?? [];
    list.push(s);
    buckets.set(key, list);
  }

  // Zusätzlich: gleiche Namen ohne Datum mit NEU vs. echte ID zusammenführen
  const byName = new Map<string, Sterbefall[]>();
  for (const s of candidates) {
    const nameKey = fallNameMatchKey(s);
    if (nameKey.length < 3) continue;
    const list = byName.get(nameKey) ?? [];
    list.push(s);
    byName.set(nameKey, list);
  }

  for (const [nameKey, list] of byName) {
    if (list.length < 2) continue;
    const hasNeu = list.some((s) => isNeuDokumentId(s.id) || isNeuDokumentId(s.sterbefallId));
    const hasReal = list.some((s) => isWahrscheinlichEchteSterbefallId(s.sterbefallId ?? s.id));
    if (!(hasNeu && hasReal) && list.length < 2) continue;
    const key = `name:${nameKey}`;
    if (!buckets.has(key) || (buckets.get(key)?.length ?? 0) < list.length) {
      buckets.set(key, list);
    }
  }

  const groups: FallDuplikatGruppe[] = [];
  const seenPairKeys = new Set<string>();

  for (const [key, faelle] of buckets) {
    const unique = dedupeByDocId(faelle);
    const active = unique.filter((s) => !istInHistory(s));
    if (active.length < 2) continue;

    const idsKey = unique
      .map((s) => s.id)
      .sort()
      .join('|');
    if (seenPairKeys.has(idsKey)) continue;
    seenPairKeys.add(idsKey);

    const keep = preferierterFall(active);
    const removeIds = active.filter((s) => s.id !== keep.id).map((s) => s.id);
    if (removeIds.length === 0) continue;

    groups.push({
      key,
      label: displayName(keep),
      faelle: unique.sort((a, b) => fallDuplikatKeepScore(b) - fallDuplikatKeepScore(a)),
      keepId: keep.id,
      removeIds,
    });
  }

  return groups.sort((a, b) => a.label.localeCompare(b.label, 'de'));
}

function dedupeByDocId(faelle: Sterbefall[]): Sterbefall[] {
  const map = new Map<string, Sterbefall>();
  for (const s of faelle) map.set(s.id, s);
  return [...map.values()];
}

/** Zählt empfohlene Entfernungen über alle Gruppen. */
export function countEmpfohleneDuplikatEntfernungen(groups: FallDuplikatGruppe[]): number {
  const ids = new Set<string>();
  for (const g of groups) for (const id of g.removeIds) ids.add(id);
  return ids.size;
}

/** Keep-ID für eine Menge zu entfernender Doc-IDs (aus Gruppen). */
export function keepIdForRemoveIds(
  groups: FallDuplikatGruppe[],
  removeIds: string[]
): string | null {
  const remove = new Set(removeIds);
  for (const g of groups) {
    if (g.removeIds.some((id) => remove.has(id))) return g.keepId;
  }
  return null;
}
