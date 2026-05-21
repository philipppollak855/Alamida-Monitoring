# Alamida Monitoring — Vollständiges Setup
#Requires -Version 5.1
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent

Write-Host "=== Alamida Monitoring Setup ===" -ForegroundColor Cyan

# 1. Firebase Firestore + Rules (falls CLI eingeloggt)
if (Get-Command firebase -ErrorAction SilentlyContinue) {
    Push-Location (Join-Path $Root "firebase")
    firebase deploy --only firestore:rules --project alamida---monitoring 2>&1 | Out-Host
    Pop-Location
}

# 2. Agent-Credentials aus Firebase CLI (Refresh Token)
$firebaseConfig = Join-Path $env:USERPROFILE ".config\configstore\firebase-tools.json"
$agentDir = Join-Path $env:APPDATA "AlamidaMonitoring"
New-Item -ItemType Directory -Force -Path $agentDir | Out-Null

if (Test-Path $firebaseConfig) {
    $fb = Get-Content $firebaseConfig | ConvertFrom-Json
    $cred = @{
        projectId = "alamida---monitoring"
        refreshToken = $fb.tokens.refresh_token
        clientId = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com"
    }
    $credPath = Join-Path $agentDir "firebase-oauth.json"
    $cred | ConvertTo-Json | Set-Content $credPath -Encoding UTF8
    Write-Host "Agent OAuth gespeichert: $credPath" -ForegroundColor Green
} else {
    Write-Warning "firebase-tools.json nicht gefunden - bitte firebase login ausfuehren"
}

# 3. Field-Mapping kopieren
Copy-Item (Join-Path $Root "docs\field-mapping-9.2.1.json") (Join-Path $agentDir "field-mapping-9.2.1.json") -Force

# 4. Web .env
$webEnv = Join-Path $Root "web\.env"
if (-not (Test-Path $webEnv)) {
    Copy-Item (Join-Path $Root "web\.env.example") $webEnv -ErrorAction SilentlyContinue
}
if (Test-Path (Join-Path $Root "web\.env")) {
    Write-Host "web/.env vorhanden" -ForegroundColor Green
} elseif (Test-Path (Join-Path $Root "web\.env.example")) {
    Copy-Item (Join-Path $Root "web\.env.example") $webEnv
}

# 5. Agent bauen
Push-Location (Join-Path $Root "agent")
dotnet build -c Release | Out-Host
Pop-Location

# 6. Autostart-Verknüpfung
$exe = Join-Path $Root "agent\Alamida.Monitoring.Agent\bin\Release\net8.0-windows\AlamidaMonitoringAgent.exe"
if (Test-Path $exe) {
    $startup = [Environment]::GetFolderPath("Startup")
    $lnk = Join-Path $startup "Alamida Monitoring Agent.lnk"
    $wsh = New-Object -ComObject WScript.Shell
    $sc = $wsh.CreateShortcut($lnk)
    $sc.TargetPath = $exe
    $sc.WorkingDirectory = Split-Path $exe
    $sc.Description = "Alamida Monitoring Watcher"
    $sc.Save()
    Write-Host "Autostart: $lnk" -ForegroundColor Green
}

# 7. Web bauen
Push-Location (Join-Path $Root "web")
if (Test-Path "package.json") {
    npm install 2>&1 | Out-Null
    npm run build 2>&1 | Out-Host
}
Pop-Location

Write-Host "`nFertig. Agent starten: $exe" -ForegroundColor Cyan
Write-Host 'Web lokal: cd web; npm run dev' -ForegroundColor Cyan
Write-Host 'Netlify: netlify login; netlify deploy --prod --dir=web/dist' -ForegroundColor Cyan
