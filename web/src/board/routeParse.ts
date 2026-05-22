/** Trennzeichen zwischen Überführungsorten (wie Alamida / Agent). */
const ROUTE_SEP =
  /\s+(?:nach|über|ueber)\s+|\s+\/\s+|\s+-\s+/i;

export function parseUeberfuehrungRoute(text?: string): { von: string; nach: string | null } {
  const trimmed = text?.trim() ?? '';
  if (!trimmed) return { von: '', nach: null };

  const parts = trimmed
    .split(ROUTE_SEP)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length < 2) return { von: trimmed, nach: null };
  return { von: parts[0], nach: parts[1] };
}
