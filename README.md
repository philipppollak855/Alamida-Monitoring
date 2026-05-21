# Alamida Monitoring

Erweiterung für Alamida (FileMaker): Windows-Agent liest die Überführungs-Detailmaske mit (UIA) und synchronisiert nach **Firebase Firestore**. Web-UI zeigt Kühlraum-Belegung und Überführungen in Echtzeit.

**Projekt:** `alamida---monitoring`  
**Live (Web):** https://alamida---monitoring.web.app  
**Wandmonitor:** https://alamida---monitoring.web.app/wall

## Einmal-Setup (automatisch)

```powershell
cd c:\Users\offic\Alamida-Monitoring
.\scripts\setup-complete.ps1
```

Das Skript:
- deployt Firestore Rules
- speichert Agent-OAuth (`%AppData%\AlamidaMonitoring\firebase-oauth.json`)
- kopiert Field-Mapping
- baut Agent + Web
- legt **Windows-Autostart** für den Agent an

## Agent (Tray)

```powershell
# Manuell starten
.\agent\Alamida.Monitoring.Agent\bin\Release\net8.0-windows\AlamidaMonitoringAgent.exe

# UI-Inspector (Discovery)
dotnet run --project agent\Alamida.Monitoring.Agent -- --inspect

# Einmaliger Snapshot-Test
dotnet run --project agent\Alamida.Monitoring.Agent -- --once
```

Nach Alamida-Start: Überführungs-Detailmaske öffnen → Agent erkennt Kühlraum, von/nach, Abholung → Firestore.

## Web deployen

**Firebase Hosting** (bereits eingerichtet):

```powershell
.\scripts\deploy-web.ps1 -Target firebase
```

**Netlify** (optional):

```powershell
cd web
netlify login
netlify deploy --prod --dir=dist
```

Env-Vars in Netlify: alle `VITE_FIREBASE_*` aus `web/.env.example`.

## Firebase (erledigt)

- Firestore-Datenbank `(default)` in **europe-west3**
- Security Rules deployed (Web: lesen, Schreiben: nur Agent)
- Web-App „Alamida Monitoring Web“ registriert

Console: https://console.firebase.google.com/project/alamida---monitoring

## Struktur

| Ordner | Inhalt |
|--------|--------|
| `agent/` | .NET 8 Tray + FlaUI Watcher |
| `web/` | React + Vite |
| `firebase/` | Rules + Hosting |
| `docs/` | Field-Mapping, Discovery |
| `scripts/` | setup-complete, deploy-web |

## Field-Mapping anpassen

1. Alamida 9.2.1 öffnen, Detailmaske Überführung
2. `dotnet run --project agent\Alamida.Monitoring.Agent -- --inspect`
3. `docs\inspector-dump.txt` prüfen
4. `docs\field-mapping-9.2.1.json` anpassen

## Hinweise

- Kühlraum kommt aus **Alamida-Eingabe** — Monitoring spiegelt nur.
- Offline: Snapshots in `%AppData%\AlamidaMonitoring\pending-snapshots.json`, Retry bei nächstem Sync.
- Alamida starten: `C:\Alamida\Alamida 9.2.1.fmp12`
