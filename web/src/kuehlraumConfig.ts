/** Firmen-Kühlräume mit fester Platzanzahl (anpassbar). */
export const KUEHLRAUM_CONFIG: Record<
  string,
  { plaetze: number; label: string; match: RegExp }
> = {
  'Kühlr. Grafenbach': {
    plaetze: 9,
    label: 'Firmenkühlraum Grafenbach',
    match: /grafenbach/i,
  },
};

export function matchKuehlraumConfig(kuehlraumId?: string) {
  if (!kuehlraumId) return null;
  for (const cfg of Object.values(KUEHLRAUM_CONFIG)) {
    if (cfg.match.test(kuehlraumId)) return cfg;
  }
  return null;
}
