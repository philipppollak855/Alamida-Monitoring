export function parseDatumDe(s?: string): number {
  if (!s) return Number.MAX_SAFE_INTEGER;
  const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
}
