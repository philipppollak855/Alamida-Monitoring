import { describe, expect, it } from 'vitest';
import { serializeZusatzTermin } from './zusatzTermine';

describe('serializeZusatzTermin', () => {
  it('lässt optionale undefined-Felder weg', () => {
    const out = serializeZusatzTermin({
      id: 'z1',
      docId: 'd1',
      sterbefallId: 's1',
      name: 'Meier',
      art: 'sonstiges',
      title: 'Termin',
      dayKey: '2026-07-30',
      zeit: undefined,
      ort: undefined,
      note: undefined,
      updatedAtMs: 123,
    });
    expect(out).toEqual({
      id: 'z1',
      docId: 'd1',
      sterbefallId: 's1',
      name: 'Meier',
      art: 'sonstiges',
      title: 'Termin',
      dayKey: '2026-07-30',
      updatedAtMs: 123,
    });
    expect('ort' in out).toBe(false);
    expect('zeit' in out).toBe(false);
  });

  it('behält gesetzte optionale Felder', () => {
    const out = serializeZusatzTermin({
      id: 'z1',
      docId: '',
      sterbefallId: '',
      name: 'X',
      art: 'graben',
      title: 'Graben',
      dayKey: '2026-07-30',
      zeit: '08:00',
      ort: 'Friedhof',
      note: ' Hinweis ',
    });
    expect(out.zeit).toBe('08:00');
    expect(out.ort).toBe('Friedhof');
    expect(out.note).toBe('Hinweis');
  });
});
