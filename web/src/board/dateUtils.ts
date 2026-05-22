export function parseDatumDe(s?: string): number {
  if (!s) return Number.MAX_SAFE_INTEGER;
  const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
}

/** dd.MM.yyyy → lokales Datum Mitternacht, sonst null */
export function parseDatumDeToDate(s?: string): Date | null {
  if (!s?.trim()) return null;
  const m = s.trim().match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function dayKeyFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dayKeyFromDeDatum(datum?: string): string | null {
  const d = parseDatumDeToDate(datum);
  return d ? dayKeyFromDate(d) : null;
}

export function parseDatumZeitDe(
  datum?: string,
  zeit?: string,
  endOfDayIfNoTime = false
): number | null {
  const d = parseDatumDeToDate(datum);
  if (!d) return null;

  let h = endOfDayIfNoTime ? 23 : 0;
  let min = endOfDayIfNoTime ? 59 : 0;
  let sec = endOfDayIfNoTime ? 59 : 0;
  let ms = endOfDayIfNoTime ? 999 : 0;

  if (zeit?.trim()) {
    const tm = zeit.trim().match(/(\d{1,2})[.:](\d{2})/);
    if (tm) {
      h = +tm[1];
      min = +tm[2];
      sec = 0;
      ms = 0;
    }
  }

  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, min, sec, ms).getTime();
}

export function formatZeitDe(zeit?: string): string {
  if (!zeit?.trim()) return '';
  const tm = zeit.trim().match(/(\d{1,2})[.:](\d{2})/);
  return tm ? `${tm[1].padStart(2, '0')}:${tm[2]}` : zeit.trim();
}

export function formatDayLabelDe(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('de-AT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function isNextCalendarDay(aKey: string, bKey: string): boolean {
  const [ay, am, ad] = aKey.split('-').map(Number);
  const next = new Date(ay, am - 1, ad + 1);
  return dayKeyFromDate(next) === bKey;
}
