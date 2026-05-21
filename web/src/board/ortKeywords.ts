/** Entspricht agent/.../OrtSchluesselwoerter.cs */
const KREMATION_KEYWORDS = [
  'krematorium',
  'innermanzing',
  'feba',
  'kremation',
  'einäscherung',
  'einaescherung',
  'feuerbestattung',
  'einäscherungsanlage',
];

const KRANKENHAUS_PREFIXES = ['UK ', 'UK-', 'KH ', 'KH-', 'KH.'];

const KRANKENHAUS_KEYWORDS = [
  'krankenhaus',
  'spital',
  'klinik',
  'landesklinik',
];

export function istKrematorium(ort?: string): boolean {
  if (!ort?.trim()) return false;
  const lower = ort.trim().toLowerCase();
  return KREMATION_KEYWORDS.some((kw) => lower.includes(kw));
}

export function istKrankenhaus(ort?: string): boolean {
  if (!ort?.trim()) return false;
  const t = ort.trim();
  if (KRANKENHAUS_PREFIXES.some((p) => t.toLowerCase().startsWith(p.toLowerCase())))
    return true;
  const lower = t.toLowerCase();
  return KRANKENHAUS_KEYWORDS.some((kw) => lower.includes(kw));
}

export function ortLabel(ort: string): string {
  return ort.trim().replace(/\s+/g, ' ');
}
