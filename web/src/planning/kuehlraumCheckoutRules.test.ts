import {
  clampKuehlraumCheckoutZeit,
  earliestKuehlraumCheckoutZeit,
  isKuehlraumCheckoutZeitAllowed,
  isSlotFreeEffectiveForNow,
  pickFuneralCeremonyForCheckout,
  shouldHoldInKuehlraumUntilCheckout,
} from './kuehlraumCheckoutRules';
import type { CeremonyInfo, SlotFreeEvent } from './types';
import { setDispositionSettings } from '../settings/dispositionSettingsStore';
import { DEFAULT_DISPOSITION_SETTINGS } from '../config/defaultDispositionSettings';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

describe('kuehlraumCheckoutRules', () => {
  beforeEach(() => {
    setDispositionSettings(DEFAULT_DISPOSITION_SETTINGS);
  });
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

  it('hält Berger bis 10:00 im Kühlraum (TF 11:00)', () => {
    const berger = {
      id: '260153',
      verstorbenerName: 'Friedrich Berger',
      aktuellePosition: 'Gloggnitz',
      imAnschluss: true,
      trauerfeierdatum: '28.07.2026',
      trauerfeierzeit: '11:00',
      beisetzungsdatum: '28.07.2026',
      ausstehend: [
        {
          zeile: 1,
          schrittTyp: 'ueberfuehrung' as const,
          vonOrt: 'Grafenbach',
          nachOrt: 'Gloggnitz',
          terminAm: '28.07.2026',
          status: 'heute',
        },
      ],
      verlauf: [
        { typ: 'abholung', nachOrt: 'Kühl. Grafenbach', ort: 'Kühl. Grafenbach' },
        { typ: 'ueberfuehrung', nachOrt: 'Gloggnitz', ort: 'Gloggnitz' },
      ],
    };
    expect(shouldHoldInKuehlraumUntilCheckout(berger, new Date(2026, 6, 28, 8, 0))).toBe(true);
    expect(shouldHoldInKuehlraumUntilCheckout(berger, new Date(2026, 6, 28, 10, 0))).toBe(false);
  });
});
