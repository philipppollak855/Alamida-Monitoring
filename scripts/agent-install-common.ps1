# Gemeinsame Hilfen fuer Wizard, Setup und Wandmonitor-Launcher
$script:AlamidaWallUrl = 'https://alamida---monitoring.web.app/wall'
$script:AlamidaGitHubOwner = 'philipppollak855'
$script:AlamidaGitHubRepo = 'Alamida-Monitoring'
$script:AlamidaAssetFileName = 'AlamidaMonitoringAgent-win-x64.zip'
$script:AlamidaDefaultInstallDir = 'C:\AlamidaMonitoring'

function Get-AlamidaAppDataDir {
    $dir = Join-Path $env:APPDATA 'AlamidaMonitoring'
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    return $dir
}

function Get-AlamidaInstallConfigPath {
    Join-Path (Get-AlamidaAppDataDir) 'install.json'
}

function Read-AlamidaInstallConfig {
    $path = Get-AlamidaInstallConfigPath
    if (-not (Test-Path $path)) { return $null }
    try {
        return Get-Content $path -Raw | ConvertFrom-Json
    } catch {
        return $null
    }
}

function Write-AlamidaInstallConfig {
    param([string] $InstallDir)
    $cfg = @{
        InstallDir = (Resolve-Path $InstallDir).Path
        WallUrl    = $script:AlamidaWallUrl
        InstalledAt = (Get-Date).ToString('o')
    }
    $cfg | ConvertTo-Json | Set-Content (Get-AlamidaInstallConfigPath) -Encoding UTF8
}

function Resolve-AlamidaInstallDir {
    param([string] $Hint = '')
    if ($Hint -and (Test-Path (Join-Path $Hint 'AlamidaMonitoringAgent.exe'))) {
        return (Resolve-Path $Hint).Path
    }
    $cfg = Read-AlamidaInstallConfig
    if ($cfg -and $cfg.InstallDir) {
        $fromCfg = $cfg.InstallDir
        if (Test-Path (Join-Path $fromCfg 'AlamidaMonitoringAgent.exe')) {
            return $fromCfg
        }
    }
    if (Test-Path (Join-Path $script:AlamidaDefaultInstallDir 'AlamidaMonitoringAgent.exe')) {
        return $script:AlamidaDefaultInstallDir
    }
    return $null
}

function Get-AlamidaGitHubHeaders {
    @{ 'User-Agent' = 'AlamidaMonitoring-Install'; Accept = 'application/vnd.github+json' }
}

function Get-AlamidaLatestReleaseAsset {
    $apiUrl = "https://api.github.com/repos/$script:AlamidaGitHubOwner/$script:AlamidaGitHubRepo/releases/latest"
    $release = Invoke-RestMethod -Uri $apiUrl -Headers (Get-AlamidaGitHubHeaders) -TimeoutSec 120
    $asset = $release.assets | Where-Object { $_.name -eq $script:AlamidaAssetFileName } | Select-Object -First 1
    if (-not $asset) { throw "Release-Asset nicht gefunden: $script:AlamidaAssetFileName" }
    return $asset
}

function Save-AlamidaAgentZip {
    param(
        [string] $DestinationPath,
        [scriptblock] $OnProgress = $null
    )
    $asset = Get-AlamidaLatestReleaseAsset
    if ($OnProgress) { & $OnProgress "Lade $($asset.name) ..." }
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $DestinationPath -UseBasicParsing
    return $asset
}

function Unblock-AlamidaPath {
    param([string] $Path)
    try {
        if (Test-Path $Path) {
            Unblock-File -Path $Path -ErrorAction SilentlyContinue
        }
        if (Test-Path $Path -PathType Container) {
            Get-ChildItem -Path $Path -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
                Unblock-File -LiteralPath $_.FullName -ErrorAction SilentlyContinue
            }
        }
    } catch { }
}

function Find-AlamidaServiceAccountNearby {
    $dirs = @(
        $PSScriptRoot,
        (Split-Path $PSScriptRoot -Parent),
        [Environment]::GetFolderPath('Desktop'),
        (Get-Location).Path
    )
    foreach ($d in $dirs) {
        if (-not $d -or -not (Test-Path $d)) { continue }
        $exact = Join-Path $d 'serviceAccount.json'
        if (Test-AlamidaServiceAccountFile $exact) {
            return (Resolve-Path $exact).Path
        }
        foreach ($f in Get-ChildItem -Path $d -Filter '*.json' -File -ErrorAction SilentlyContinue) {
            if (Test-AlamidaServiceAccountFile $f.FullName) {
                return $f.FullName
            }
        }
    }
    return $null
}

function Test-AlamidaServiceAccountFile {
    param([string] $Path)
    if (-not $Path -or -not (Test-Path $Path)) { return $false }
    $text = Get-Content $Path -Raw -ErrorAction SilentlyContinue
    return $text -match 'private_key' -and $text -match 'client_email'
}

function Install-AlamidaServiceAccount {
    param([string] $SourcePath)
    if (-not (Test-AlamidaServiceAccountFile $SourcePath)) {
        throw "Ungueltige serviceAccount.json: $SourcePath"
    }
    $dest = Join-Path (Get-AlamidaAppDataDir) 'serviceAccount.json'
    Copy-Item $SourcePath $dest -Force
    return $dest
}

function Test-AlamidaFirebaseReady {
    $dir = Get-AlamidaAppDataDir
    if (Test-AlamidaServiceAccountFile (Join-Path $dir 'serviceAccount.json')) { return $true }
    if (Test-Path (Join-Path $dir 'firebase-oauth.json')) { return $true }
    return $false
}

function Expand-AlamidaAgentZip {
    param(
        [string] $ZipPath,
        [string] $InstallDir
    )
    Unblock-AlamidaPath $ZipPath
    if (Test-Path $InstallDir) {
        Get-Process -Name 'AlamidaMonitoringAgent' -ErrorAction SilentlyContinue | Stop-Process -Force
        Start-Sleep -Seconds 1
        Remove-Item $InstallDir -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    Expand-Archive -Path $ZipPath -DestinationPath $InstallDir -Force
    Unblock-AlamidaPath $InstallDir
    $exe = Join-Path $InstallDir 'AlamidaMonitoringAgent.exe'
    if (-not (Test-Path $exe)) {
        throw "Nach dem Entpacken fehlt: $exe"
    }
}

function Copy-AlamidaInstallScripts {
    param([string] $InstallDir)
    $files = @(
        'agent-install-common.ps1',
        'apply-agent-release.ps1',
        'launch-wall-monitor.ps1'
    )
    foreach ($f in $files) {
        $src = Join-Path $PSScriptRoot $f
        if (Test-Path $src) {
            Copy-Item $src (Join-Path $InstallDir $f) -Force
        }
    }
}

function Initialize-AlamidaAgentSetup {
    param(
        [string] $InstallDir,
        [string] $ServiceAccountSource = ''
    )
    $InstallDir = (Resolve-Path $InstallDir).Path
    $exe = Join-Path $InstallDir 'AlamidaMonitoringAgent.exe'
    if (-not (Test-Path $exe)) { throw "Agent-EXE fehlt: $exe" }

    $agentDir = Get-AlamidaAppDataDir
    $mappingSrc = Join-Path $InstallDir 'field-mapping-9.2.1.json'
    $mappingDst = Join-Path $agentDir 'field-mapping-9.2.1.json'
    if (Test-Path $mappingSrc) {
        Copy-Item $mappingSrc $mappingDst -Force
    }

    if ($ServiceAccountSource) {
        Install-AlamidaServiceAccount -SourcePath $ServiceAccountSource
    } elseif (Test-Path (Join-Path $InstallDir 'serviceAccount.json')) {
        Install-AlamidaServiceAccount -SourcePath (Join-Path $InstallDir 'serviceAccount.json')
    } else {
        $near = Find-AlamidaServiceAccountNearby
        if ($near) { Install-AlamidaServiceAccount -SourcePath $near }
    }

    $firebaseConfig = Join-Path $env:USERPROFILE '.config\configstore\firebase-tools.json'
    $credPath = Join-Path $agentDir 'firebase-oauth.json'
    if ((Test-Path $firebaseConfig) -and -not (Test-AlamidaFirebaseReady)) {
        $fb = Get-Content $firebaseConfig | ConvertFrom-Json
        @{
            projectId    = 'alamida---monitoring'
            refreshToken = $fb.tokens.refresh_token
            clientId     = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
            clientSecret = 'j9iVZfS8kkCEFUPaAeJV0sAi'
        } | ConvertTo-Json | Set-Content $credPath -Encoding UTF8
    }

    Register-AlamidaAgentAutostart -InstallDir $InstallDir
    Register-AlamidaAgentDesktopShortcut -InstallDir $InstallDir
    Copy-AlamidaInstallScripts -InstallDir $InstallDir
    Write-AlamidaInstallConfig -InstallDir $InstallDir

    @{
        InstallDir = $InstallDir
        HasFirebase = Test-AlamidaFirebaseReady
        CredPath = $agentDir
    }
}

function Start-AlamidaAgentVerified {
    param([string] $InstallDir)
    Start-AlamidaAgentIfNeeded -InstallDir $InstallDir
    Start-Sleep -Seconds 2
    $p = Get-Process -Name 'AlamidaMonitoringAgent' -ErrorAction SilentlyContinue
    if (-not $p) {
        $log = Join-Path (Get-AlamidaAppDataDir) 'agent-crash.log'
        $hint = if (Test-Path $log) { "`nSiehe: $log" } else { '' }
        throw "Agent-Prozess startet nicht (Windows blockiert evtl. die EXE).$hint`nRechtsklick EXE -> Eigenschaften -> Zulassen."
    }
}

function Register-AlamidaAgentAutostart {
    param([string] $InstallDir)
    $exe = Join-Path $InstallDir 'AlamidaMonitoringAgent.exe'
    if (-not (Test-Path $exe)) {
        throw "Autostart nicht moeglich - EXE fehlt: $exe"
    }

    $startup = [Environment]::GetFolderPath('Startup')
    $lnk = Join-Path $startup 'Alamida Monitoring Agent.lnk'
    New-AlamidaShortcut -ShortcutPath $lnk -TargetPath $exe -WorkingDirectory $InstallDir `
        -Description 'Alamida Monitoring Watcher' -IconLocation "$exe,0"

    if (-not (Test-Path $lnk)) {
        throw "Autostart-Verknuepfung konnte nicht erstellt werden: $lnk"
    }

    # Fallback: geplante Aufgabe beim Anmelden (falls Startup-Ordner blockiert ist)
    $taskName = 'AlamidaMonitoringAgent'
    schtasks.exe /Delete /TN $taskName /F 2>$null | Out-Null
    $tr = "`"$exe`""
    schtasks.exe /Create /TN $taskName /TR $tr /SC ONLOGON /RL LIMITED /F 2>&1 | Out-Null
}

function Register-AlamidaAgentDesktopShortcut {
    param([string] $InstallDir)
    $exe = Join-Path $InstallDir 'AlamidaMonitoringAgent.exe'
    if (-not (Test-Path $exe)) { return }
    $desktop = [Environment]::GetFolderPath('Desktop')
    $lnk = Join-Path $desktop 'Alamida Monitoring Agent.lnk'
    New-AlamidaShortcut -ShortcutPath $lnk -TargetPath $exe -WorkingDirectory $InstallDir `
        -Description 'Alamida Monitoring Watcher' -IconLocation "$exe,0"
}

function New-AlamidaShortcut {
    param(
        [string] $ShortcutPath,
        [string] $TargetPath,
        [string] $Arguments = '',
        [string] $WorkingDirectory = '',
        [string] $Description = '',
        [string] $IconLocation = ''
    )
    $dir = Split-Path $ShortcutPath -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $wsh = New-Object -ComObject WScript.Shell
    $sc = $wsh.CreateShortcut($ShortcutPath)
    $sc.TargetPath = $TargetPath
    if ($Arguments) { $sc.Arguments = $Arguments }
    if ($WorkingDirectory) { $sc.WorkingDirectory = $WorkingDirectory }
    if ($Description) { $sc.Description = $Description }
    if ($IconLocation) { $sc.IconLocation = $IconLocation }
    $sc.Save()
}

function Register-AlamidaWallDesktopShortcut {
    param([string] $InstallDir)
    $launcher = Join-Path $InstallDir 'launch-wall-monitor.ps1'
    if (-not (Test-Path $launcher)) {
        Copy-AlamidaInstallScripts -InstallDir $InstallDir
    }
    $desktop = [Environment]::GetFolderPath('Desktop')
    $lnk = Join-Path $desktop 'Alamida Wandmonitor.lnk'
    $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $args = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`""
    $icon = Resolve-AlamidaEdgeIcon
    New-AlamidaShortcut -ShortcutPath $lnk -TargetPath $ps -Arguments $args `
        -WorkingDirectory $InstallDir -Description 'Wandmonitor mit Auto-Update' -IconLocation $icon
}

function Resolve-AlamidaEdgeIcon {
    $candidates = @(
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
    )
    foreach ($p in $candidates) {
        if (Test-Path $p) { return "$p,0" }
    }
    return "$env:SystemRoot\System32\imageres.dll,109"
}

function Test-AlamidaAgentUpdateAvailable {
    param([string] $InstallDir)
    $script = Join-Path $InstallDir 'apply-agent-release.ps1'
    if (-not (Test-Path $script)) { return $false }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -InstallDir $InstallDir -CheckOnly
    return $LASTEXITCODE -eq 0
}

function Invoke-AlamidaAgentUpdate {
    param([string] $InstallDir)
    $script = Join-Path $InstallDir 'apply-agent-release.ps1'
    if (-not (Test-Path $script)) { return $false }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -InstallDir $InstallDir -Apply
    return $LASTEXITCODE -eq 0
}

function Start-AlamidaAgentIfNeeded {
    param([string] $InstallDir)
    if (Get-Process -Name 'AlamidaMonitoringAgent' -ErrorAction SilentlyContinue) { return }
    $exe = Join-Path $InstallDir 'AlamidaMonitoringAgent.exe'
    if (Test-Path $exe) {
        Start-Process -FilePath $exe -WorkingDirectory $InstallDir
    }
}

function Open-AlamidaWallMonitor {
    $url = $script:AlamidaWallUrl
    $edgePaths = @(
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
    )
    foreach ($edge in $edgePaths) {
        if (Test-Path $edge) {
            Start-Process -FilePath $edge -ArgumentList "--app=$url"
            return
        }
    }
    Start-Process $url
}

function Invoke-AlamidaWallMonitorLaunch {
    param([string] $InstallDir = '')
    $dir = Resolve-AlamidaInstallDir -Hint $InstallDir
    if (-not $dir) {
        [System.Windows.Forms.MessageBox]::Show(
            "Alamida Monitoring ist nicht installiert.`n`nBitte zuerst install-wizard ausfuehren.",
            'Wandmonitor',
            'OK',
            'Warning') | Out-Null
        return
    }

    if (-not (Test-AlamidaFirebaseReady)) {
        [System.Windows.Forms.MessageBox]::Show(
            "Firebase-Zugang fehlt - der Agent kann nicht synchronisieren.`n`n" +
            "serviceAccount.json nach`n$((Get-AlamidaAppDataDir))`nkopieren und Wizard erneut ausfuehren.",
            'Wandmonitor',
            'OK',
            'Warning') | Out-Null
    }

    if (Test-AlamidaAgentUpdateAvailable -InstallDir $dir) {
        Invoke-AlamidaAgentUpdate -InstallDir $dir
        $dir = Resolve-AlamidaInstallDir -Hint $dir
        if (-not $dir) { return }
    }

    Start-AlamidaAgentIfNeeded -InstallDir $dir
    Open-AlamidaWallMonitor
}
