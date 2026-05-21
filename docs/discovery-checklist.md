# Discovery-Checkliste — Alamida 9.2.1

## Vorbereitung

1. Alamida starten: `C:\Alamida\Alamida 9.2.1.fmp12` (nicht die veraltete `Starter.bat` mit 7.0.6)
2. Agent-Inspector ausführen (siehe README)
3. Detailmaske **Überführung** öffnen

## Zu dokumentieren

| Feld | Sichtbares Label in Alamida | Control-Typ | In `field-mapping-9.2.1.json` |
|------|----------------------------|-------------|-------------------------------|
| Sterbefall-ID | z. B. Aktenzeichen | Edit | `sterbefallId` |
| Verstorbener | Name | Edit | `verstorbenerName` |
| Kühlraum | Kühlraum / Nr. | ComboBox/Edit | `kuehlraum` |
| Von | Abholort / von | Edit | `vonOrt` |
| Nach | Ziel / nach | Edit | `nachOrt` |
| Abholung | Tag Abholung | Edit/Date | `abholungAm` |

## Inspector-Befehl

```powershell
cd agent
dotnet run --project Alamida.Monitoring.Agent -- --inspect
```

Ausgabe: `docs/inspector-dump.txt` — AutomationId, Name, ControlType pro Element.

## Test

1. Werte in Detailmaske ändern
2. Agent im Dev-Modus: `dotnet run -- --once`
3. Firestore Console: Dokument in `sterbefaelle` / `ueberfuehrungen` prüfen
