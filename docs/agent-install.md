# Agent installieren (Wizard, ohne Git)

## Schnellstart (empfohlen)

1. Ordner `dist/agent-release/installer` vom Release oder Repo `scripts\` auf den PC kopieren (z. B. USB oder Desktop).
2. **`install-wizard.bat`** doppelklicken.
3. Im Wizard:
   - Zielordner bestätigen (Standard: `C:\AlamidaMonitoring`)
   - ZIP von GitHub laden **oder** lokale `AlamidaMonitoringAgent-win-x64.zip` wählen
   - Fertigstellen

Der Wizard:

- entpackt das ZIP am richtigen Ort,
- richtet Firebase/AppData ein (wenn `firebase login` vorhanden),
- trägt den **Agent im Windows-Autostart** ein,
- legt auf dem **Desktop** die Verknüpfung **„Alamida Wandmonitor“** an.

## Wandmonitor-Verknüpfung

Öffnet bei jedem Start:

1. Prüfung auf neues **Agent-Release** (GitHub) → bei Bedarf Update + Neustart
2. Start des Agents (falls nicht läuft)
3. Wandmonitor im Edge-App-Fenster: https://alamida---monitoring.web.app/wall

## Einmal pro PC: Firebase

Falls der Wizard kein OAuth findet, nach `%AppData%\AlamidaMonitoring\` legen:

- `firebase-oauth.json` (via `firebase login` auf diesem PC), oder
- `serviceAccount.json`

`WorkstationId` in `appsettings.json` **leer lassen** → PC-Name wird verwendet.

## Manuell (ohne Wizard)

```powershell
# ZIP nach C:\AlamidaMonitoring entpacken, dann:
powershell -ExecutionPolicy Bypass -File setup-agent-install.ps1 -InstallDir "C:\AlamidaMonitoring"
```

## Updates

- Automatisch beim **Agent-Start** und bei **Öffnen der Wandmonitor-Verknüpfung**
- Tray: **Update prüfen…**

## Entwickler

Im Git-Repo: `AutoUpdate.Mode = "git"` in `appsettings.json`.
