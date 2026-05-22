import type {
  DispositionSettings,
  EigenerKuehlraumConfig,
  WallTabWechselSekunden,
} from '../types/dispositionSettings';
import { wallDurationsFromSettings } from '../hooks/useWallTabRotation';
import { DEFAULT_DISPOSITION_SETTINGS } from '../config/defaultDispositionSettings';
import { dedupeKeywords } from './recognitionEngine';

export function normalizeDispositionSettings(
  raw: Partial<DispositionSettings> | undefined
): DispositionSettings {
  if (!raw) return { ...DEFAULT_DISPOSITION_SETTINGS };

  const eigeneKuehlraeume: EigenerKuehlraumConfig[] =
    raw.eigeneKuehlraeume?.length
      ? raw.eigeneKuehlraeume.map((k, i) => {
          const keywords = dedupeKeywords(k.matchKeywords ?? []);
          const alamida = k.alamidaName?.trim();
          if (alamida && !keywords.some((kw) => kw.toLowerCase() === alamida.toLowerCase())) {
            keywords.unshift(alamida);
          }
          return {
            id: (k.id || `kr-${i}`).trim() || `kr-${i}`,
            label: (k.label || 'Kühlraum').trim(),
            alamidaName: alamida || undefined,
            matchKeywords: keywords,
            plaetze: Math.max(1, Math.min(99, Number(k.plaetze) || 1)),
          };
        })
      : [...DEFAULT_DISPOSITION_SETTINGS.eigeneKuehlraeume];

  const wallRaw = raw.wallTabWechselSekunden;
  const wallDurations = wallDurationsFromSettings(wallRaw);
  const wallTabWechselSekunden: WallTabWechselSekunden = {
    kuehlraum: wallDurations.kuehlraum,
    extern: wallDurations.extern,
    kalender: wallDurations.kalender,
    abholungen: wallDurations.abholungen,
    offen: wallDurations.offen,
  };

  return {
    kremationKeywords: dedupeKeywords(
      raw.kremationKeywords?.length
        ? raw.kremationKeywords
        : DEFAULT_DISPOSITION_SETTINGS.kremationKeywords
    ),
    krankenhausPrefixe: dedupeKeywords(
      raw.krankenhausPrefixe?.length
        ? raw.krankenhausPrefixe
        : DEFAULT_DISPOSITION_SETTINGS.krankenhausPrefixe
    ),
    krankenhausKeywords: dedupeKeywords(
      raw.krankenhausKeywords?.length
        ? raw.krankenhausKeywords
        : DEFAULT_DISPOSITION_SETTINGS.krankenhausKeywords
    ),
    eigeneKuehlraeume,
    wallTabWechselSekunden,
    updatedAt: raw.updatedAt,
  };
}
