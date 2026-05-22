# Agent installieren (ohne Git)

Für Alamida-PCs **ohne** Git und ohne .NET SDK.

## 1. Release laden

1. Öffne [GitHub Releases](https://github.com/philipppollak855/Alamida-Monitoring/releases/latest)
2. Datei **`AlamidaMonitoringAgent-win-x64.zip`** herunterladen
3. In einen festen Ordner entpacken, z. B. `C:\AlamidaMonitoring\`

Der Ordner enthält u. a. `AlamidaMonitoringAgent.exe`, `version.txt`, `appsettings.json`.

## 2. Einmal pro PC: Setup

Im entpackten Ordner (oder vom Repo `scripts\`):

```powershell
cd C:\AlamidaMonitoring
# Falls setup-Skript aus Repo vorhanden:
powershell -ExecutionPolicy Bypass -File "C:\Pfad\zum\Repo\scripts\setup-agent-install.ps1" -InstallDir "C:\AlamidaMonitoring"
```

Das Skript:

- legt **Autostart** an
- kopiert Field-Mapping nach `%AppData%\AlamidaMonitoring\` (falls noch nicht da)
- übernimmt **Firebase OAuth** von `firebase login` (falls auf diesem PC ausgeführt)

### Firebase-Zugang

Der Agent braucht **einmalig** Credentials in `%AppData%\AlamidaMonitoring\`:

- `firebase-oauth.json` (via Setup-Skript / `firebase login`), oder
- `serviceAccount.json` (manuell vom Firebase-Projekt)

`WorkstationId` in `appsettings.json` **leer lassen** → Windows-PC-Name wird verwendet.

## 3. Agent starten

Doppelklick auf `AlamidaMonitoringAgent.exe` oder Autostart nach Setup.

## Updates

- Beim Start prüft der Agent automatisch das **neueste GitHub-Release** und installiert es (Tray: **Update prüfen…**).
- Voraussetzung: Internet + öffentliches Repo (kein Git nötig).
- Lokale `appsettings.json` bleibt beim Update erhalten.

## Neuen PC einrichten (Kurz)

1. ZIP entpacken  
2. `setup-agent-install.ps1 -InstallDir …`  
3. Firebase-Credential in AppData (falls Setup keins gefunden hat)  
4. Fertig — kein Repo-Klon nötig

## Entwickler (mit Git)

Im Repo `AutoUpdate:Mode` auf `"git"` setzen oder `scripts\update-agent.ps1 -Apply` nutzen.
