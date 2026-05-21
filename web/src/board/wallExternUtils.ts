import type { Sterbefall } from '../types';
import { matchKuehlraumConfig } from '../kuehlraumConfig';
import { istKrankenhaus, istKrematorium, ortLabel } from './ortKeywords';

export interface ExternFallEintrag {
  sterbefallId: string;
  name: string;
  hinweis: string;
  terminAm?: string;
}

export interface ExternOrtGruppe {
  key: string;
  typ: 'krankenhaus' | 'kremation';
  ort: string;
  faelle: ExternFallEintrag[];
}

function isAktiv(s: Sterbefall): boolean {
  return s.aktivInAlamida !== false;
}

/** Liegt im firmeneigenen Kühlraum (z. B. Grafenbach). */
export function isImEigenenKuehlraum(s: Sterbefall): boolean {
  return s.status === 'im_kuehlraum' && !!matchKuehlraumConfig(s.kuehlraumId);
}

function hatOffeneAbholungVomSterbeort(s: Sterbefall): boolean {
  return (s.ausstehend ?? []).some(
    (a) =>
      a.istAbholungVomSterbeort ||
      a.status === 'abholung_noetig' ||
      (a.schrittTyp === 'abholung' &&
        (a.status === 'heute' || a.status === 'geplant'))
  );
}

function naechsterSchritt(s: Sterbefall) {
  const offen = (s.ausstehend ?? []).filter(
    (a) =>
      a.status === 'heute' ||
      a.status === 'geplant' ||
      a.status === 'abholung_noetig'
  );
  return offen[0];
}

function hinweisFuerFall(s: Sterbefall, typ: 'krankenhaus' | 'kremation'): string {
  const n = naechsterSchritt(s);
  if (n?.status === 'heute') return 'Termin heute';
  if (n?.status === 'abholung_noetig') return 'Abholung ausstehend';
  if (typ === 'kremation' && s.aktuellePositionTyp === 'kremation') return 'Im Krematorium';
  if (s.aktuellePositionTyp === 'sterbeort') return 'Am Sterbeort';
  if (n?.schrittTyp === 'abholung') return 'Wartet auf Abholung';
  if (n?.schrittTyp === 'kremation') return 'Kremation geplant';
  return 'Wartend';
}

/**
 * Ermittelt externen Standort (Krankenhaus oder Krematorium), sofern der Verstorbene
 * nicht im eigenen Kühlraum liegt.
 */
export function resolveExternStandort(
  s: Sterbefall
): { typ: 'krankenhaus' | 'kremation'; ort: string } | null {
  if (!isAktiv(s) || isImEigenenKuehlraum(s)) return null;

  const pos = s.aktuellePosition?.trim();

  if (pos && istKrematorium(pos)) {
    return { typ: 'kremation', ort: ortLabel(pos) };
  }
  if (pos && istKrankenhaus(pos)) {
    return { typ: 'krankenhaus', ort: ortLabel(pos) };
  }

  if (s.aktuellePositionTyp === 'sterbeort' && s.sterbeort && istKrankenhaus(s.sterbeort)) {
    return { typ: 'krankenhaus', ort: ortLabel(s.sterbeort) };
  }

  if (hatOffeneAbholungVomSterbeort(s)) {
    const ort = s.sterbeort || s.abholort;
    if (ort && istKrankenhaus(ort)) {
      return { typ: 'krankenhaus', ort: ortLabel(ort) };
    }
    if (s.abholortIstKrankenhaus && s.abholort) {
      return { typ: 'krankenhaus', ort: ortLabel(s.abholort) };
    }
  }

  const naechster = naechsterSchritt(s);
  if (naechster?.schrittTyp === 'abholung' && naechster.vonOrt && istKrankenhaus(naechster.vonOrt)) {
    return { typ: 'krankenhaus', ort: ortLabel(naechster.vonOrt) };
  }
  if (naechster?.schrittTyp === 'kremation') {
    const kremOrt =
      (naechster.vonOrt && istKrematorium(naechster.vonOrt) ? naechster.vonOrt : null) ||
      (naechster.nachOrt && istKrematorium(naechster.nachOrt) ? naechster.nachOrt : null) ||
      s.endziel;
    if (kremOrt && istKrematorium(kremOrt)) {
      return { typ: 'kremation', ort: ortLabel(kremOrt) };
    }
  }

  if (s.endziel && istKrematorium(s.endziel) && s.aktuellePositionTyp === 'kremation') {
    return { typ: 'kremation', ort: ortLabel(s.endziel) };
  }

  return null;
}

export function buildExternGruppen(sterbefaelle: Sterbefall[]): ExternOrtGruppe[] {
  const map = new Map<string, ExternOrtGruppe>();

  for (const s of sterbefaelle) {
    const standort = resolveExternStandort(s);
    if (!standort) continue;

    const key = `${standort.typ}:${standort.ort.toLowerCase()}`;
    const id = s.sterbefallId ?? s.id;
    const name = s.verstorbenerName ?? id;
    const n = naechsterSchritt(s);

    if (!map.has(key)) {
      map.set(key, {
        key,
        typ: standort.typ,
        ort: standort.ort,
        faelle: [],
      });
    }

    map.get(key)!.faelle.push({
      sterbefallId: id,
      name,
      hinweis: hinweisFuerFall(s, standort.typ),
      terminAm: n?.terminAm ?? n?.abholungAm ?? s.naechsterSchrittAm,
    });
  }

  const gruppen = [...map.values()];
  for (const g of gruppen) {
    g.faelle.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  return gruppen.sort((a, b) => {
    if (a.typ !== b.typ) return a.typ === 'krankenhaus' ? -1 : 1;
    return a.ort.localeCompare(b.ort, 'de');
  });
}

export function externGesamt(gruppen: ExternOrtGruppe[]): number {
  return gruppen.reduce((n, g) => n + g.faelle.length, 0);
}
