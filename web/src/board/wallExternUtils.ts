import type { Sterbefall } from '../types';
import { istInHistory } from './historieLogic';
import {
  canonicalKrankenhausAnzeigeLabel,
  collectKrankenhausKandidaten,
  isGenericKrankenhausKey,
  krankenhausOrtKey,
  matchNamedKrankenhausGruppe,
  resolveBestKrankenhausOrt,
} from '../settings/krankenhausOrt';
import { istKrankenhaus, istKrematorium, ortLabel } from './ortKeywords';
import { isAusstehendHeute, isAusstehendHeuteOrGeplant } from './ausstehendStatus';
import {
  hatAusstehendeUeberfuehrungInsEigeneKr,
  isAmKrankenhausOderSterbeort,
  isImEigenenKuehlraum,
  zielIstEigenerKuehlraum,
} from './kuehlraumLogic';
import { istInUrnenBereich } from './urnenLogic';
import { istAktuellImKrematorium, letzteAbgeschlosseneEtappe } from './positionLogic';

export interface ExternFallEintrag {
  docId: string;
  sterbefallId: string;
  name: string;
  hinweis: string;
  terminAm?: string;
  /** Nur bei typ kremation — Retour → Urnen */
  kremationOrt?: string;
}

export interface ExternOrtGruppe {
  key: string;
  typ: 'krankenhaus' | 'kremation';
  ort: string;
  faelle: ExternFallEintrag[];
}

function isAktiv(s: Sterbefall): boolean {
  if (istInHistory(s)) return false;
  return s.aktivInAlamida !== false;
}

function hatOffeneAbholungVomSterbeort(s: Sterbefall): boolean {
  return (s.ausstehend ?? []).some(
    (a) =>
      a.istAbholungVomSterbeort ||
      a.status === 'abholung_noetig' ||
      (a.schrittTyp === 'abholung' && isAusstehendHeuteOrGeplant(a))
  );
}

function naechsterSchritt(s: Sterbefall) {
  const offen = (s.ausstehend ?? []).filter(
    (a) => a.status === 'abholung_noetig' || isAusstehendHeuteOrGeplant(a)
  );
  return offen[0];
}

function hinweisFuerFall(s: Sterbefall, typ: 'krankenhaus' | 'kremation'): string {
  const n = naechsterSchritt(s);
  if (n && isAusstehendHeute(n)) return 'Termin heute';
  if (n?.status === 'abholung_noetig') return 'Abholung ausstehend';

  // Noch am KH/Sterbeort — vor „Überführung ohne Datum“, auch wenn KR-Überführung vorgebucht ist
  if (typ === 'krankenhaus') {
    if (s.aktuellePositionTyp === 'sterbeort' || isAmKrankenhausOderSterbeort(s)) {
      return 'Am Sterbeort';
    }
  } else if (s.aktuellePositionTyp === 'sterbeort') {
    return 'Am Sterbeort';
  }

  if (hatAusstehendeUeberfuehrungInsEigeneKr(s)) return 'Überführung ohne Datum';
  if (typ === 'kremation' && istAktuellImKrematorium(s)) return 'Im Krematorium';
  if (n?.schrittTyp === 'abholung') return 'Wartet auf Abholung';
  if (n?.schrittTyp === 'kremation') return 'Kremation geplant';
  return 'Wartend';
}

function kremationOrtLabel(s: Sterbefall): string | null {
  const pos = s.aktuellePosition?.trim();
  if (pos && istKrematorium(pos)) return ortLabel(pos);

  const letzte = letzteAbgeschlosseneEtappe(s);
  const ort = letzte?.nachOrt ?? letzte?.ort;
  if (ort && istKrematorium(ort)) return ortLabel(ort);

  if (s.endziel && istKrematorium(s.endziel)) return ortLabel(s.endziel);

  return null;
}

function istExternKrankenhausFall(s: Sterbefall): boolean {
  if (isImEigenenKuehlraum(s) || istAktuellImKrematorium(s)) return false;

  const pos = s.aktuellePosition?.trim();
  if (pos && istKrankenhaus(pos)) return true;

  if (s.aktuellePositionTyp === 'sterbeort' || hatAusstehendeUeberfuehrungInsEigeneKr(s)) {
    const khOrt = s.sterbeort || s.abholort;
    if (khOrt && istKrankenhaus(khOrt)) return true;
    if ((s.ausstehend ?? []).some((a) => a.vonOrt && istKrankenhaus(a.vonOrt))) return true;
  }

  if (
    (s.aktuellePositionTyp === 'sterbeort' || !s.aktuellePosition?.trim()) &&
    s.sterbeort &&
    istKrankenhaus(s.sterbeort)
  ) {
    return true;
  }

  if (hatOffeneAbholungVomSterbeort(s)) {
    const ort = s.sterbeort || s.abholort;
    if (ort && istKrankenhaus(ort)) return true;
    if (s.abholortIstKrankenhaus && s.abholort) return true;
  }

  const naechster = naechsterSchritt(s);
  if (
    naechster?.schrittTyp === 'abholung' &&
    naechster.vonOrt &&
    istKrankenhaus(naechster.vonOrt)
  ) {
    return true;
  }

  if (isAmKrankenhausOderSterbeort(s)) {
    const fallback = s.sterbeort || s.abholort;
    if (fallback && istKrankenhaus(fallback)) return true;
    if (s.abholortIstKrankenhaus && s.abholort) return true;
  }

  return false;
}

function normalizeEigenerKrZiel(s: Sterbefall): string | null {
  for (const a of s.ausstehend ?? []) {
    if (zielIstEigenerKuehlraum(a.nachOrt)) return (a.nachOrt ?? '').trim().toLowerCase();
  }
  if (zielIstEigenerKuehlraum(s.naechsterSchrittNach)) {
    return s.naechsterSchrittNach!.trim().toLowerCase();
  }
  if (zielIstEigenerKuehlraum(s.naechsteUeberfuehrungNach)) {
    return s.naechsteUeberfuehrungNach!.trim().toLowerCase();
  }
  return null;
}

/** „UK“-Fall der passenden benannten Klinik zuordnen (Peer mit gleichem KR-Ziel). */
function inferNamedKhKeyForGenericFall(
  s: Sterbefall,
  namedMeta: { key: string; slug: string }[],
  alle: Sterbefall[]
): string | null {
  const direct = matchNamedKrankenhausGruppe(s, namedMeta);
  if (direct) return direct;

  const ziel = normalizeEigenerKrZiel(s);
  if (ziel) {
    for (const other of alle) {
      if (other.id === s.id) continue;
      if (normalizeEigenerKrZiel(other) !== ziel) continue;
      const peerKey = matchNamedKrankenhausGruppe(other, namedMeta);
      if (peerKey) return peerKey;
    }
  }

  if (namedMeta.length === 1) return namedMeta[0].key;
  return null;
}

function resolveKrankenhausStandort(
  s: Sterbefall,
  alle: Sterbefall[]
): { typ: 'krankenhaus'; ort: string } | null {
  if (!istExternKrankenhausFall(s)) return null;

  let ort = resolveBestKrankenhausOrt(collectKrankenhausKandidaten(s));
  if (!ort?.trim()) return null;

  if (isGenericKrankenhausKey(krankenhausOrtKey(ort))) {
    const namedMeta = alle
      .map((x) => {
        const kandidaten = collectKrankenhausKandidaten(x);
        const o = resolveBestKrankenhausOrt(kandidaten);
        if (!o || isGenericKrankenhausKey(krankenhausOrtKey(o))) return null;
        return { key: `krankenhaus:${krankenhausOrtKey(o)}`, slug: krankenhausOrtKey(o) };
      })
      .filter((x): x is { key: string; slug: string } => x != null);
    const unique = [...new Map(namedMeta.map((m) => [m.key, m])).values()];
    const inferredKey = inferNamedKhKeyForGenericFall(s, unique, alle);
    if (inferredKey) {
      const slug = inferredKey.replace(/^krankenhaus:/, '');
      const peer = alle.find((x) => {
        const o = resolveBestKrankenhausOrt(collectKrankenhausKandidaten(x));
        return o && krankenhausOrtKey(o) === slug;
      });
      if (peer) {
        ort = resolveBestKrankenhausOrt(collectKrankenhausKandidaten(peer)) ?? ort;
      }
    }
  }

  return { typ: 'krankenhaus', ort: ort.trim() };
}

/** Fälle mit nur „UK“/„KH“ der passenden benannten KH-Karte zuordnen (auch bei mehreren Kliniken). */
function mergeOrphanGenericKhGruppen(
  gruppen: ExternOrtGruppe[],
  sterbefaelle: Sterbefall[]
): ExternOrtGruppe[] {
  const kh = gruppen.filter((g) => g.typ === 'krankenhaus');
  const named = kh.filter((g) => {
    const slug = g.key.replace(/^krankenhaus:/, '');
    return !isGenericKrankenhausKey(slug);
  });
  const generic = kh.filter((g) => {
    const slug = g.key.replace(/^krankenhaus:/, '');
    return isGenericKrankenhausKey(slug);
  });

  if (generic.length === 0 || named.length === 0) return gruppen;

  const fallByDoc = new Map(sterbefaelle.map((s) => [s.id, s]));
  const namedMeta = named.map((g) => ({
    key: g.key,
    slug: g.key.replace(/^krankenhaus:/, ''),
    gruppe: g,
  }));

  for (const g of generic) {
    const unassigned: ExternFallEintrag[] = [];

    for (const f of g.faelle) {
      const s = fallByDoc.get(f.docId);
      const targetKey = s
        ? inferNamedKhKeyForGenericFall(s, namedMeta, sterbefaelle)
        : named.length === 1
          ? named[0].key
          : null;

      const target = targetKey
        ? namedMeta.find((n) => n.key === targetKey)?.gruppe
        : named.length === 1
          ? named[0]
          : null;

      if (target) {
        target.faelle.push(f);
        target.ort = canonicalKrankenhausAnzeigeLabel(target.ort);
      } else {
        unassigned.push(f);
      }
    }

    g.faelle = unassigned;
  }

  for (const g of named) {
    g.faelle.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  const emptyGenericKeys = new Set(
    generic.filter((g) => g.faelle.length === 0).map((g) => g.key)
  );
  return gruppen.filter((g) => !emptyGenericKeys.has(g.key));
}

function resolveKremationStandort(
  s: Sterbefall
): { typ: 'kremation'; ort: string } | null {
  if (!istAktuellImKrematorium(s)) {
    const naechster = naechsterSchritt(s);
    if (naechster?.schrittTyp !== 'kremation') return null;

    const kremOrt =
      (naechster.vonOrt && istKrematorium(naechster.vonOrt) ? naechster.vonOrt : null) ||
      (naechster.nachOrt && istKrematorium(naechster.nachOrt) ? naechster.nachOrt : null) ||
      (s.endziel && istKrematorium(s.endziel) ? s.endziel : null);
    if (!kremOrt || isImEigenenKuehlraum(s)) return null;
    return { typ: 'kremation', ort: ortLabel(kremOrt) };
  }

  const ort = kremationOrtLabel(s);
  if (ort) return { typ: 'kremation', ort };

  return null;
}

/**
 * Ermittelt externen Standort (Krankenhaus oder Krematorium), sofern der Verstorbene
 * nicht im eigenen Kühlraum liegt.
 */
export function resolveExternStandort(
  s: Sterbefall
): { typ: 'krankenhaus' | 'kremation'; ort: string } | null {
  if (!isAktiv(s)) return null;
  if (istInUrnenBereich(s)) return null;
  if (isImEigenenKuehlraum(s)) return null;

  const krem = resolveKremationStandort(s);
  if (krem) return krem;

  const kh = resolveKrankenhausStandort(s, [s]);
  if (kh) return kh;

  return null;
}

function resolveExternStandortWithAlle(
  s: Sterbefall,
  alle: Sterbefall[]
): { typ: 'krankenhaus' | 'kremation'; ort: string } | null {
  if (!isAktiv(s)) return null;
  if (istInUrnenBereich(s)) return null;
  if (isImEigenenKuehlraum(s)) return null;

  const krem = resolveKremationStandort(s);
  if (krem) return krem;

  const kh = resolveKrankenhausStandort(s, alle);
  if (kh) return kh;

  return null;
}

export function buildExternGruppen(sterbefaelle: Sterbefall[]): ExternOrtGruppe[] {
  const map = new Map<string, ExternOrtGruppe>();

  for (const s of sterbefaelle) {
    const standort = resolveExternStandortWithAlle(s, sterbefaelle);
    if (!standort) continue;

    const key =
      standort.typ === 'krankenhaus'
        ? `krankenhaus:${krankenhausOrtKey(standort.ort)}`
        : `${standort.typ}:${ortLabel(standort.ort).toLowerCase()}`;
    const id = s.sterbefallId ?? s.id;
    const name = s.verstorbenerName ?? id;
    const n = naechsterSchritt(s);

    const displayOrt =
      standort.typ === 'krankenhaus'
        ? canonicalKrankenhausAnzeigeLabel(standort.ort)
        : ortLabel(standort.ort);

    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        typ: standort.typ,
        ort: displayOrt,
        faelle: [],
      });
    } else if (standort.typ === 'krankenhaus') {
      existing.ort = canonicalKrankenhausAnzeigeLabel(standort.ort);
    }

    map.get(key)!.faelle.push({
      docId: s.id,
      sterbefallId: id,
      name,
      hinweis: hinweisFuerFall(s, standort.typ),
      terminAm: n?.terminAm ?? n?.abholungAm ?? s.naechsterSchrittAm,
      kremationOrt: standort.typ === 'kremation' ? displayOrt : undefined,
    });
  }

  let gruppen = [...map.values()];
  for (const g of gruppen) {
    g.faelle.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  gruppen = mergeOrphanGenericKhGruppen(gruppen, sterbefaelle);

  return gruppen.sort((a, b) => {
    if (a.typ !== b.typ) return a.typ === 'krankenhaus' ? -1 : 1;
    return a.ort.localeCompare(b.ort, 'de');
  });
}

export function externGesamt(gruppen: ExternOrtGruppe[]): number {
  return gruppen.reduce((n, g) => n + g.faelle.length, 0);
}
