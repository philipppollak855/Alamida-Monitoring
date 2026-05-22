# Desktop-Verknüpfung: Agent-Update prüfen, Agent starten, Wandmonitor öffnen
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
. (Join-Path $PSScriptRoot 'agent-install-common.ps1')
Invoke-AlamidaWallMonitorLaunch -InstallDir $PSScriptRoot
