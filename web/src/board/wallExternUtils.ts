import type { Sterbefall } from '../types';
import { istInHistory } from './historieLogic';
import { istKrankenhaus, istKrematorium, ortLabel } from './ortKeywords';
import { isAusstehendHeute, isAusstehendHeuteOrGeplant } from './ausstehendStatus';
import {
  hatAusstehendeUeberfuehrungInsEigeneKr,
  isAmKrankenhausOderSterbeort,
  isImEigenenKuehlraum,
} from './kuehlraumLogic';
import { istAktuellImKrematorium, letzteAbgeschlosseneEtappe } from './positionLogic';

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
  if (hatAusstehendeUeberfuehrungInsEigeneKr(s)) return 'Überführung ohne Datum';
  if (typ === 'kremation' && istAktuellImKrematorium(s)) return 'Im Krematorium';
  if (s.aktuellePositionTyp === 'sterbeort') return 'Am Sterbeort';
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

function resolveKrankenhausStandort(
  s: Sterbefall
): { typ: 'krankenhaus'; ort: string } | null {
  if (isImEigenenKuehlraum(s) || istAktuellImKrematorium(s)) return null;

  const pos = s.aktuellePosition?.trim();
  if (pos && istKrankenhaus(pos)) {
    return { typ: 'krankenhaus', ort: ortLabel(pos) };
  }

  if (s.aktuellePositionTyp === 'sterbeort' || hatAusstehendeUeberfuehrungInsEigeneKr(s)) {
    const khOrt = s.sterbeort || s.abholort;
    if (khOrt && istKrankenhaus(khOrt)) {
      return { typ: 'krankenhaus', ort: ortLabel(khOrt) };
    }
    const vonKh = (s.ausstehend ?? []).find((a) => a.vonOrt && istKrankenhaus(a.vonOrt))?.vonOrt;
    if (vonKh) return { typ: 'krankenhaus', ort: ortLabel(vonKh) };
  }

  if (
    (s.aktuellePositionTyp === 'sterbeort' || !s.aktuellePosition?.trim()) &&
    s.sterbeort &&
    istKrankenhaus(s.sterbeort)
  ) {
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
  if (
    naechster?.schrittTyp === 'abholung' &&
    naechster.vonOrt &&
    istKrankenhaus(naechster.vonOrt)
  ) {
    return { typ: 'krankenhaus', ort: ortLabel(naechster.vonOrt) };
  }

  if (isAmKrankenhausOderSterbeort(s)) {
    const fallback = s.sterbeort || s.abholort;
    if (fallback && istKrankenhaus(fallback)) {
      return { typ: 'krankenhaus', ort: ortLabel(fallback) };
    }
    if (s.abholortIstKrankenhaus && s.abholort) {
      return { typ: 'krankenhaus', ort: ortLabel(s.abholort) };
    }
  }

  return null;
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
  if (isImEigenenKuehlraum(s)) return null;

  const krem = resolveKremationStandort(s);
  if (krem) return krem;

  const kh = resolveKrankenhausStandort(s);
  if (kh) return kh;

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
