import type { Sterbefall } from '../types';
import { istFehlerhafterPlatzhalterFall } from './historieLogic';

export type FallDuplikatGruppe = {
  key: string;
  label: string;
  faelle: Sterbefall[];
  /** Empfohlener behaltener Fall */
  keepId: string;
  /** Empfohlen zu entfernen */
  removeIds: string[];
};

function normalizeNameKey(raw?: string): string {
  return (raw ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9äöüß\s-]/gi, '')
    .replace(/\s+/g, ' ');
}

function displayName(s: Sterbefall): string {
  return (
    s.verstorbenerName?.trim() ||
    [s.verstorbenerVorname, s.verstorbenerNachname].filter(Boolean).join(' ').trim() ||
    s.sterbefallId ||
    s.id
  );
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

/**
 * Findet Duplikat-Gruppen (gleicher Name; optional gleiches Sterbedatum).
 * Platzhalter-Namen werden ignoriert.
 */
export function findFallDuplikatGruppen(sterbefaelle: Sterbefall[]): FallDuplikatGruppe[] {
  const buckets = new Map<string, Sterbefall[]>();

  for (const s of sterbefaelle) {
    if (istFehlerhafterPlatzhalterFall(s)) continue;
    const nameKey = normalizeNameKey(displayName(s));
    if (nameKey.length < 3) continue;
    const dateKey = sterbedatumKey(s);
    // Ohne Datum nur nach Name; mit Datum Name+Datum — aber Name-only Gruppen
    // zusätzlich, wenn mehrere mit gleichem Namen und gemischten Daten/NEU.
    const key = dateKey ? `${nameKey}|${dateKey}` : `name:${nameKey}`;
    const list = buckets.get(key) ?? [];
    list.push(s);
    buckets.set(key, list);
  }

  // Zusätzlich: gleiche Namen ohne Datum mit NEU vs. echte ID zusammenführen
  const byName = new Map<string, Sterbefall[]>();
  for (const s of sterbefaelle) {
    if (istFehlerhafterPlatzhalterFall(s)) continue;
    const nameKey = normalizeNameKey(displayName(s));
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
    // Nur wenn noch keine Datum-Gruppe diese Kombination abdeckt
    const key = `name:${nameKey}`;
    if (!buckets.has(key) || (buckets.get(key)?.length ?? 0) < list.length) {
      buckets.set(key, list);
    }
  }

  const groups: FallDuplikatGruppe[] = [];
  const seenPairKeys = new Set<string>();

  for (const [key, faelle] of buckets) {
    const unique = dedupeByDocId(faelle);
    if (unique.length < 2) continue;

    const idsKey = unique
      .map((s) => s.id)
      .sort()
      .join('|');
    if (seenPairKeys.has(idsKey)) continue;
    seenPairKeys.add(idsKey);

    const keep = preferierterFall(unique);
    groups.push({
      key,
      label: displayName(keep),
      faelle: unique.sort((a, b) => fallDuplikatKeepScore(b) - fallDuplikatKeepScore(a)),
      keepId: keep.id,
      removeIds: unique.filter((s) => s.id !== keep.id).map((s) => s.id),
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
