import { useEffect, useMemo, useState } from 'react';
import type { DispositionSettings, EigenerKuehlraumConfig } from '../types/dispositionSettings';
import { useDispositionSettings } from '../settings/SettingsProvider';
import { classifyOrt } from '../settings/recognitionEngine';
import { dedupeKeywords } from '../settings/recognitionEngine';
import {
  settingsChanged,
  validateDispositionSettings,
} from '../settings/settingsValidation';
import { normalizeDispositionSettings } from '../settings/settingsNormalize';

const TEST_BEISPIELE = [
  'UK-Neunkirchen',
  'KH Wolfsberg',
  'Kühlr. Grafenbach',
  'Feba Krematorium',
  'Wien',
];

function parseLines(text: string): string[] {
  return dedupeKeywords(
    text
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function linesToText(items: string[]): string {
  return items.join('\n');
}

function KeywordSection({
  title,
  hint,
  count,
  value,
  onChange,
}: {
  title: string;
  hint: string;
  count: number;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [text, setText] = useState(linesToText(value));
  useEffect(() => setText(linesToText(value)), [value]);

  return (
    <div className="settings-block">
      <div className="settings-block-head">
        <h4>{title}</h4>
        <span className="settings-count">{count} Einträge</span>
      </div>
      <p className="settings-hint">{hint}</p>
      <textarea
        className="settings-textarea"
        rows={4}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseLines(e.target.value));
        }}
        spellCheck={false}
      />
    </div>
  );
}

function emptyKuehlraum(): EigenerKuehlraumConfig {
  return {
    id: crypto.randomUUID(),
    label: 'Neuer Kühlraum',
    matchKeywords: [],
    plaetze: 9,
  };
}

export function DispositionSettingsPanel({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const { settings, loading, saving, error, saveSettings } = useDispositionSettings();
  const [open, setOpen] = useState(defaultOpen);
  const [draft, setDraft] = useState<DispositionSettings>(() =>
    normalizeDispositionSettings(settings)
  );
  const [savedOk, setSavedOk] = useState(false);
  const [testOrt, setTestOrt] = useState('');

  useEffect(() => {
    if (!open) setDraft(normalizeDispositionSettings(settings));
  }, [settings, open]);

  const normalizedDraft = useMemo(() => normalizeDispositionSettings(draft), [draft]);
  const validation = useMemo(
    () => validateDispositionSettings(normalizedDraft),
    [normalizedDraft]
  );
  const dirty = useMemo(
    () => settingsChanged(normalizedDraft, settings),
    [normalizedDraft, settings]
  );
  const testErgebnis = useMemo(
    () => classifyOrt(testOrt, normalizedDraft),
    [testOrt, normalizedDraft]
  );

  const updateKuehlraum = (index: number, patch: Partial<EigenerKuehlraumConfig>) => {
    setDraft((d) => ({
      ...d,
      eigeneKuehlraeume: d.eigeneKuehlraeume.map((k, i) =>
        i === index ? { ...k, ...patch } : k
      ),
    }));
  };

  const handleSave = async () => {
    setSavedOk(false);
    try {
      await saveSettings(normalizedDraft);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 4000);
    } catch {
      /* Fehler in context */
    }
  };

  const applyBeispiel = (ort: string) => setTestOrt(ort);

  return (
    <section className="panel settings-panel">
      <button
        type="button"
        className="settings-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="settings-toggle-title">Erkennung & Kühlraum</span>
        <span className="settings-toggle-meta">
          Keywords, Plätze, Prüfen — für Disposition, Wandmonitor & Agent
          {dirty && open ? ' · Ungespeicherte Änderungen' : ''}
        </span>
        <span className="case-chevron" aria-hidden />
      </button>

      {open && (
        <div className="settings-body">
          {loading ? (
            <p className="settings-hint">Lade Einstellungen…</p>
          ) : (
            <>
              <div className="settings-test panel-inset">
                <h4>Ort prüfen</h4>
                <p className="settings-hint">
                  Testet die aktuellen Entwurfs-Regeln (noch nicht gespeichert), wie der Agent sie
                  anwendet.
                </p>
                <div className="settings-test-row">
                  <input
                    type="text"
                    className="settings-test-input"
                    placeholder="z. B. UK-Neunkirchen / Kühlr. Grafenbach / Feba"
                    value={testOrt}
                    onChange={(e) => setTestOrt(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-ghost btn-small"
                    onClick={() => setTestOrt('')}
                  >
                    Leeren
                  </button>
                </div>
                <div className="settings-test-chips">
                  {TEST_BEISPIELE.map((b) => (
                    <button
                      key={b}
                      type="button"
                      className="chip chip-muted settings-test-chip"
                      onClick={() => applyBeispiel(b)}
                    >
                      {b}
                    </button>
                  ))}
                </div>
                {testOrt.trim() && (
                  <div className="settings-test-result">
                    {testErgebnis.treffer.length === 0 ? (
                      <p className="settings-test-none">Keine Regel erkannt (nur Überführung).</p>
                    ) : (
                      <ul>
                        {testErgebnis.treffer.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    )}
                    <div className="settings-test-badges">
                      {testErgebnis.kremation && (
                        <span className="chip chip-kremation">Kremation</span>
                      )}
                      {testErgebnis.krankenhaus && (
                        <span className="chip chip-warn">Krankenhaus</span>
                      )}
                      {testErgebnis.eigenerKuehlraum && (
                        <span className="chip chip-success">
                          {testErgebnis.eigenerKuehlraum.label}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {validation.warnings.length > 0 && (
                <div className="alert alert-warn settings-alert">
                  <strong>Hinweise</strong>
                  <ul>
                    {validation.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              {validation.errors.length > 0 && (
                <div className="alert alert-danger settings-alert">
                  <strong>Bitte korrigieren</strong>
                  <ul>
                    {validation.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="settings-block">
                <div className="settings-block-head">
                  <h4>Wandmonitor — Tabwechsel</h4>
                  <span className="settings-count">Sekunden pro Ansicht</span>
                </div>
                <p className="settings-hint">
                  Countdown bis zum automatischen Wechsel (5–300 s). Jeder Tab hat eine eigene
                  Dauer; gilt für alle Übergänge im Rotationsmodus.
                </p>
                <div className="settings-wall-tabs-grid">
                  {(
                    [
                      ['kuehlraum', 'Kühlraum'],
                      ['extern', 'Extern'],
                      ['kalender', 'Kalender'],
                      ['abholungen', 'Heute'],
                      ['offen', 'Offen'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="settings-wall-tab-field">
                      {label}
                      <input
                        type="number"
                        min={5}
                        max={300}
                        step={1}
                        value={draft.wallTabWechselSekunden?.[key] ?? 18}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          setDraft((d) => {
                            const base = d.wallTabWechselSekunden ?? {
                              kuehlraum: 18,
                              extern: 18,
                              kalender: 24,
                              abholungen: 18,
                              offen: 18,
                            };
                            return {
                              ...d,
                              wallTabWechselSekunden: { ...base, [key]: v },
                            };
                          });
                        }}
                      />
                      <span className="settings-wall-tab-unit">s</span>
                    </label>
                  ))}
                </div>
              </div>

              <KeywordSection
                title="Kremation / Krematorium"
                hint="Enthält-Match mit Wortgrenzen bei kurzen Keywords (min. 2 Zeichen)"
                count={normalizedDraft.kremationKeywords.length}
                value={draft.kremationKeywords}
                onChange={(kremationKeywords) => setDraft((d) => ({ ...d, kremationKeywords }))}
              />
              <KeywordSection
                title="Krankenhaus — Präfixe"
                hint="Ortsname beginnt mit … (Groß/Kleinschreibung egal)"
                count={normalizedDraft.krankenhausPrefixe.length}
                value={draft.krankenhausPrefixe}
                onChange={(krankenhausPrefixe) => setDraft((d) => ({ ...d, krankenhausPrefixe }))}
              />
              <KeywordSection
                title="Krankenhaus — Keywords"
                hint="Enthält im Ortsnamen"
                count={normalizedDraft.krankenhausKeywords.length}
                value={draft.krankenhausKeywords}
                onChange={(krankenhausKeywords) => setDraft((d) => ({ ...d, krankenhausKeywords }))}
              />

              <div className="settings-block">
                <div className="settings-block-head">
                  <h4>Eigene Kühlräume</h4>
                  <span className="settings-count">
                    {normalizedDraft.eigeneKuehlraeume.length} Kühlraum
                    {normalizedDraft.eigeneKuehlraeume.length !== 1 ? 'e' : ''}
                  </span>
                </div>
                <p className="settings-hint">
                  Erster Eintrag = Haupt-Kühlraum (Board & Wand). Alamida-Name wird automatisch als
                  Keyword übernommen.
                </p>
                {draft.eigeneKuehlraeume.map((kr, index) => (
                  <div key={kr.id} className="settings-kr-card">
                    {index === 0 && <span className="settings-kr-badge">Haupt-Kühlraum</span>}
                    <div className="settings-kr-row">
                      <label>
                        Bezeichnung
                        <input
                          type="text"
                          value={kr.label}
                          onChange={(e) => updateKuehlraum(index, { label: e.target.value })}
                        />
                      </label>
                      <label>
                        Plätze
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={kr.plaetze}
                          onChange={(e) =>
                            updateKuehlraum(index, {
                              plaetze: parseInt(e.target.value, 10) || 1,
                            })
                          }
                        />
                      </label>
                    </div>
                    <label>
                      Alamida-Name (optional)
                      <input
                        type="text"
                        placeholder="Kühlr. Grafenbach"
                        value={kr.alamidaName ?? ''}
                        onChange={(e) => updateKuehlraum(index, { alamidaName: e.target.value })}
                      />
                    </label>
                    <label>
                      Erkennungs-Keywords (je Zeile oder Komma)
                      <textarea
                        className="settings-textarea"
                        rows={3}
                        value={linesToText(kr.matchKeywords)}
                        onChange={(e) =>
                          updateKuehlraum(index, { matchKeywords: parseLines(e.target.value) })
                        }
                      />
                    </label>
                    {draft.eigeneKuehlraeume.length > 1 && (
                      <button
                        type="button"
                        className="btn-ghost btn-small"
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            eigeneKuehlraeume: d.eigeneKuehlraeume.filter((_, i) => i !== index),
                          }))
                        }
                      >
                        Kühlraum entfernen
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="btn-ghost btn-small"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      eigeneKuehlraeume: [...d.eigeneKuehlraeume, emptyKuehlraum()],
                    }))
                  }
                >
                  + Kühlraum hinzufügen
                </button>
              </div>

              {error && <p className="settings-error">{error}</p>}
              {savedOk && (
                <p className="settings-ok">
                  Gespeichert — Agent lädt beim nächsten Sync (spätestens ~45 s) neu.
                </p>
              )}

              <div className="settings-actions">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={saving || !validation.ok || !dirty}
                  onClick={() => void handleSave()}
                >
                  {saving ? 'Speichern…' : dirty ? 'Einstellungen speichern' : 'Keine Änderungen'}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={saving}
                  onClick={() => setDraft(normalizeDispositionSettings(settings))}
                >
                  Verwerfen
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
