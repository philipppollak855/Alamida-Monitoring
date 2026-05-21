# Discovery-Checkliste — Alamida 9.2.1

## Vorbereitung

1. Alamida starten: `C:\Alamida\Alamida 9.2.1.fmp12`
2. **Neuer Sterbefall**-Maske und Sterbefall-Detail oeffnen
3. Tab **Termine** (Ueberfuehrungen) und Tab **Verstorbener** (Sterbeort) jeweils mit Inspector erfassen; auf „Neuer Sterbefall“ `inspect.bat` → `AutomationId` in `neuerSterbefall.fields` eintragen

## Zu dokumentieren

| Feld | Alamida | Mapping-Key |
|------|---------|-------------|
| Sterbefall-ID | Header `260087 \| Name` | `sterbefallHeader` |
| **Sterbeort** | Maske **Verstorbener** (andere Modalansicht) | `sterbeort` |
| Ueberfuehrung 1-6 | Tab Termine, Text + Datum | `ueberfuehrungText` … `abholung6Am` |

## Inspector

```cmd
c:\Users\offic\Alamida-Monitoring\scripts\inspect.bat
```

1. Zuerst Tab **Verstorbener** aktiv, Inspector laufen lassen
2. Dann Tab **Termine**, Inspector erneut
3. In `docs/inspector-dump.txt` nach `Sterbeort`, `Todesort`, `Verstorben` suchen
4. Gefundene `AutomationId` in `docs/field-mapping-9.2.1.json` unter `sterbeort` eintragen

## Bestattungsart / Endziel

| Art | Endziel in Monitoring |
|-----|------------------------|
| Erdbestattung | `Termin_Bestattung_Ort` (Beisetzungsort) |
| Urne / Feuerbestattung | Krematorium (z. B. Innermanzing, Feba) |

Felder: `bestattungsart`, `beisetzungsort`, `krematoriumOrt` — ggf. Tab **Verstorbener** / **Sterbefalldaten** per Inspector ergänzen.

## Kühlplatz Grafenbach

In `web/src/kuehlraumConfig.ts`: Anzahl Plätze (Standard **9**) anpassen.  
Alamida-Feld `kuehlplatz` / `Kuehlraum_Nr` per Inspector mappen.

## Positionslogik (Agent)

- Position **0** = Sterbeort (Sterbeort-Maske)
- Zeilen **1..6** = Überführungsorte (Tab Termine); Typ: **Abholung** (Zeile 1), **Überführung**, **Kremation** (aus von/nach)
- **Abholort** = „von“ der Abholungszeile
- **Kremation-Keywords** (in `OrtSchluesselwoerter.cs`): Feba, Innermanzing, Krematorium, Kremation, Einäscherung, …
- **Krankenhaus** (Abholort): Präfix `UK`, `KH`, `KH-`, `KH.` sowie Krankenhaus, Spital, Klinik
- **Aktuelle Position** = Ziel der letzten Zeile mit Datum ≤ heute, sonst Sterbeort
- **Geplant** = erste Zeile mit Datum > heute
- **Dauer-Sync (Watcher)**: bei offener Detailmaske alle ~1,5 s Firestore-Touch (`lastSeenAt`, `aktivInAlamida`); bei Datenänderung voller Sync
- **Fallwechsel**: neuer Header in der Modalansicht → sofort Sync, vorheriger Fall `aktivInAlamida: false`
- **Neuer Sterbefall**: eigene Maske (`neuerSterbefall` in `field-mapping-9.2.1.json`) — Inspector auf dieser Maske ausführen und Feld-IDs verfeinern
- **Kein Voll-Duplikat**: gleicher `contentHash` → nur Heartbeat, keine redundanten Felder

## Test

```cmd
scripts\once.bat
scripts\sync-now.bat
```

Web: https://alamida---monitoring.web.app
