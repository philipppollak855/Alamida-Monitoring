import { describe, it, expect } from 'vitest';
import { extractDeDatum } from './dateUtils';

describe('extractDeDatum', () => {
  it('extrahiert Datum aus Text mit Wochentag und Uhrzeit', () => {
    expect(extractDeDatum('Montag, 08.06.2026 13:00')).toBe('08.06.2026');
  });

  it('normalisiert einstellige Tage/Monate', () => {
    expect(extractDeDatum('8.6.2026')).toBe('08.06.2026');
  });
});
