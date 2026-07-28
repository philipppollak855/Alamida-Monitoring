import { describe, expect, it } from 'vitest';
import {
  clampKuehlraumCheckoutZeit,
  earliestKuehlraumCheckoutZeit,
  isKuehlraumCheckoutZeitAllowed,
  isSlotFreeEffectiveForNow,
  pickFuneralCeremonyForCheckout,
} from './kuehlraumCheckoutRules';
import type { CeremonyInfo, SlotFreeEvent } from './types';

describe('kuehlraumCheckoutRules', () => {
  it('Trauerfeier 14:00 → Ausbuchung ab 13:00', () => {
    expect(earliestKuehlraumCheckoutZeit('14:00')).toBe('13:00');
    expect(earliestKuehlraumCheckoutZeit('14:30')).toBe('13:30');
    expect(earliestKuehlraumCheckoutZeit('09:00')).toBe('08:00');
  });

  it('erlaubt Planzeiten ab Feier − 1h, nicht früher', () => {
    expect(isKuehlraumCheckoutZeitAllowed('13:00', '14:00')).toBe(true);
    expect(isKuehlraumCheckoutZeitAllowed('14:00', '14:00')).toBe(true);
    expect(isKuehlraumCheckoutZeitAllowed('12:59', '14:00')).toBe(false);
    expect(isKuehlraumCheckoutZeitAllowed('10:00', '14:00')).toBe(false);
  });

  it('hebt zu frühe Zeiten auf Feier − 1h an', () => {
    expect(clampKuehlraumCheckoutZeit('10:00', '14:00')).toBe('13:00');
    expect(clampKuehlraumCheckoutZeit('13:30', '14:00')).toBe('13:30');
    expect(clampKuehlraumCheckoutZeit(null, '14:00')).toBe('13:00');
  });

  it('wählt Trauerfeier mit Uhrzeit vor Beisetzung ohne', () => {
    const ceremonies: CeremonyInfo[] = [
      {
        kind: 'beisetzung',
        datum: '28.07.2026',
        dayKey: '2026-07-28',
        label: 'Beisetzung',
        relativeLabel: 'heute',
      },
      {
        kind: 'trauerfeier',
        datum: '28.07.2026',
        dayKey: '2026-07-28',
        zeit: '14:00',
        label: 'Trauerfeier',
        relativeLabel: 'heute',
      },
    ];
    const host = pickFuneralCeremonyForCheckout(ceremonies, '2026-07-28');
    expect(host?.kind).toBe('trauerfeier');
    expect(host?.zeit).toBe('14:00');
  });

  it('zählt heutiges Slot-Frei erst ab Checkout-Zeit', () => {
    const event: SlotFreeEvent = {
      docId: 'x',
      name: 'Test',
      dayKey: '2026-07-28',
      zeit: '13:00',
      reason: 'beisetzung',
      vonOrt: 'KR',
      nachOrt: 'Friedhof',
    };
    const morning = new Date(2026, 6, 28, 9, 0, 0);
    const afternoon = new Date(2026, 6, 28, 13, 0, 0);
    expect(isSlotFreeEffectiveForNow(event, morning)).toBe(false);
    expect(isSlotFreeEffectiveForNow(event, afternoon)).toBe(true);
  });
});
