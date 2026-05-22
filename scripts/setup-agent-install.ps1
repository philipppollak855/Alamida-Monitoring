# Einmal-Setup nach Entpacken des Agent-ZIP (ohne Git / ohne SDK)
param(
    [string] $InstallDir = ""
)

$ErrorActionPreference = "Stop"

if (-not $InstallDir) {
    $InstallDir = Read-Host "Installationsordner (Pfad zur AlamidaMonitoringAgent.exe)"
}
$InstallDir = (Resolve-Path $InstallDir).Path
$exe = Join-Path $InstallDir "AlamidaMonitoringAgent.exe"
if (-not (Test-Path $exe)) {
    throw "AlamidaMonitoringAgent.exe nicht gefunden in: $InstallDir"
}

$agentDir = Join-Path $env:APPDATA "AlamidaMonitoring"
New-Item -ItemType Directory -Force -Path $agentDir | Out-Null

$mappingSrc = Join-Path $InstallDir "field-mapping-9.2.1.json"
$mappingDst = Join-Path $agentDir "field-mapping-9.2.1.json"
if ((Test-Path $mappingSrc) -and -not (Test-Path $mappingDst)) {
    Copy-Item $mappingSrc $mappingDst -Force
    Write-Host "Field-Mapping nach AppData kopiert." -ForegroundColor Green
}

# Firebase OAuth aus firebase login (optional)
$firebaseConfig = Join-Path $env:USERPROFILE ".config\configstore\firebase-tools.json"
if (Test-Path $firebaseConfig) {
    $fb = Get-Content $firebaseConfig | ConvertFrom-Json
    $cred = @{
        projectId    = "alamida---monitoring"
        refreshToken = $fb.tokens.refresh_token
        clientId     = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com"
        clientSecret = "j9iVZfS8kkCEFUPaAeJV0sAi"
    }
    $credPath = Join-Path $agentDir "firebase-oauth.json"
    $cred | ConvertTo-Json | Set-Content $credPath -Encoding UTF8
    Write-Host "Firebase OAuth: $credPath" -ForegroundColor Green
} else {
    Write-Warning "firebase login nicht gefunden — serviceAccount.json manuell nach $agentDir legen"
}

$startup = [Environment]::GetFolderPath("Startup")
$lnk = Join-Path $startup "Alamida Monitoring Agent.lnk"
$wsh = New-Object -ComObject WScript.Shell
$sc = $wsh.CreateShortcut($lnk)
$sc.TargetPath = $exe
$sc.WorkingDirectory = $InstallDir
$sc.Description = "Alamida Monitoring Watcher"
$sc.Save()
Write-Host "Autostart: $lnk" -ForegroundColor Green

Write-Host "`nFertig. Agent starten: $exe" -ForegroundColor Cyan
Write-Host "PC-Name wird als WorkstationId verwendet (appsettings WorkstationId leer lassen)." -ForegroundColor Gray
