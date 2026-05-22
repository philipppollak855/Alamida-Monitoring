# Installations-Wizard: ZIP entpacken, Setup, Autostart, Wandmonitor-Verknüpfung
#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

. (Join-Path $PSScriptRoot 'agent-install-common.ps1')

$script:WizardInstallDir = $script:AlamidaDefaultInstallDir
$script:WizardZipPath = ''
$script:WizardUseLocalZip = $false
$script:WizardStep = 0

function Find-NearbyAgentZip {
    $names = @($script:AlamidaAssetFileName, 'AlamidaMonitoringAgent.zip')
    $dirs = @($PSScriptRoot, (Split-Path $PSScriptRoot -Parent), [Environment]::GetFolderPath('Desktop'), (Get-Location).Path)
    foreach ($d in $dirs) {
        if (-not $d -or -not (Test-Path $d)) { continue }
        foreach ($n in $names) {
            $p = Join-Path $d $n
            if (Test-Path $p) { return (Resolve-Path $p).Path }
        }
    }
    return $null
}

function Show-WizardForm {
    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'Alamida Monitoring — Installation'
    $form.Size = New-Object System.Drawing.Size(560, 440)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.Font = New-Object System.Drawing.Font('Segoe UI', 10)

    $lblTitle = New-Object System.Windows.Forms.Label
    $lblTitle.Location = New-Object System.Drawing.Point(24, 20)
    $lblTitle.Size = New-Object System.Drawing.Size(500, 32)
    $lblTitle.Font = New-Object System.Drawing.Font('Segoe UI', 14, [System.Drawing.FontStyle]::Bold)

    $lblBody = New-Object System.Windows.Forms.Label
    $lblBody.Location = New-Object System.Drawing.Point(24, 58)
    $lblBody.Size = New-Object System.Drawing.Size(500, 220)
    $lblBody.AutoSize = $false

    $txtInstallDir = New-Object System.Windows.Forms.TextBox
    $txtInstallDir.Location = New-Object System.Drawing.Point(24, 200)
    $txtInstallDir.Size = New-Object System.Drawing.Size(380, 28)
    $txtInstallDir.Text = $script:AlamidaDefaultInstallDir
    $txtInstallDir.Visible = $false

    $btnBrowseDir = New-Object System.Windows.Forms.Button
    $btnBrowseDir.Location = New-Object System.Drawing.Point(410, 198)
    $btnBrowseDir.Size = New-Object System.Drawing.Size(100, 28)
    $btnBrowseDir.Text = 'Ordner…'
    $btnBrowseDir.Visible = $false

    $rbDownload = New-Object System.Windows.Forms.RadioButton
    $rbDownload.Location = New-Object System.Drawing.Point(24, 120)
    $rbDownload.Size = New-Object System.Drawing.Size(480, 24)
    $rbDownload.Text = 'Neuestes Release von GitHub laden (empfohlen)'
    $rbDownload.Checked = $true
    $rbDownload.Visible = $false

    $rbLocal = New-Object System.Windows.Forms.RadioButton
    $rbLocal.Location = New-Object System.Drawing.Point(24, 148)
    $rbLocal.Size = New-Object System.Drawing.Size(480, 24)
    $rbLocal.Text = 'ZIP-Datei auf diesem PC verwenden'
    $rbLocal.Visible = $false

    $btnBrowseZip = New-Object System.Windows.Forms.Button
    $btnBrowseZip.Location = New-Object System.Drawing.Point(24, 176)
    $btnBrowseZip.Size = New-Object System.Drawing.Size(120, 28)
    $btnBrowseZip.Text = 'ZIP wählen…'
    $btnBrowseZip.Visible = $false

    $lblZipPath = New-Object System.Windows.Forms.Label
    $lblZipPath.Location = New-Object System.Drawing.Point(150, 180)
    $lblZipPath.Size = New-Object System.Drawing.Size(360, 40)
    $lblZipPath.ForeColor = [System.Drawing.Color]::Gray
    $lblZipPath.Visible = $false

    $progress = New-Object System.Windows.Forms.ProgressBar
    $progress.Location = New-Object System.Drawing.Point(24, 280)
    $progress.Size = New-Object System.Drawing.Size(486, 24)
    $progress.Style = 'Marquee'
    $progress.MarqueeAnimationSpeed = 30
    $progress.Visible = $false

    $lblStatus = New-Object System.Windows.Forms.Label
    $lblStatus.Location = New-Object System.Drawing.Point(24, 310)
    $lblStatus.Size = New-Object System.Drawing.Size(486, 40)
    $lblStatus.ForeColor = [System.Drawing.Color]::DarkGreen
    $lblStatus.Visible = $false

    $btnBack = New-Object System.Windows.Forms.Button
    $btnBack.Location = New-Object System.Drawing.Point(24, 350)
    $btnBack.Size = New-Object System.Drawing.Size(100, 32)
    $btnBack.Text = 'Zurück'
    $btnBack.Enabled = $false

    $btnNext = New-Object System.Windows.Forms.Button
    $btnNext.Location = New-Object System.Drawing.Point(410, 350)
    $btnNext.Size = New-Object System.Drawing.Size(100, 32)
    $btnNext.Text = 'Weiter'

    $btnCancel = New-Object System.Windows.Forms.Button
    $btnCancel.Location = New-Object System.Drawing.Point(300, 350)
    $btnCancel.Size = New-Object System.Drawing.Size(100, 32)
    $btnCancel.Text = 'Abbrechen'

    $form.Controls.AddRange(@(
        $lblTitle, $lblBody, $txtInstallDir, $btnBrowseDir,
        $rbDownload, $rbLocal, $btnBrowseZip, $lblZipPath,
        $progress, $lblStatus, $btnBack, $btnNext, $btnCancel
    ))

    $nearbyZip = Find-NearbyAgentZip
    if ($nearbyZip) {
        $script:WizardZipPath = $nearbyZip
        $script:WizardUseLocalZip = $true
    }

    function Set-StepControls {
        param([int]$Step)
        $script:WizardStep = $Step
        $txtInstallDir.Visible = $Step -eq 1
        $btnBrowseDir.Visible = $Step -eq 1
        $rbDownload.Visible = $Step -eq 2
        $rbLocal.Visible = $Step -eq 2
        $btnBrowseZip.Visible = ($Step -eq 2) -and $rbLocal.Checked
        $lblZipPath.Visible = $Step -eq 2
        $progress.Visible = $Step -eq 3
        $lblStatus.Visible = $Step -ge 3
        $btnBack.Enabled = $Step -gt 0 -and $Step -lt 4
        $btnNext.Enabled = $Step -lt 4
        $btnNext.Visible = $Step -lt 4
        $btnCancel.Enabled = $Step -lt 4

        switch ($Step) {
            0 {
                $lblTitle.Text = 'Willkommen'
                $lblBody.Text = @"
Richtet auf diesem PC ein:

• Alamida Monitoring Agent (ZIP)
• Autostart für den Agent
• Desktop-Verknüpfung „Alamida Wandmonitor“
  (prüft Updates, öffnet den Wandmonitor)

Installationsziel standardmäßig:
$script:AlamidaDefaultInstallDir
"@
            }
            1 {
                $lblTitle.Text = 'Installationsordner'
                $lblBody.Text = 'Der Agent wird in diesen Ordner entpackt. Bestehende Installation wird ersetzt.'
            }
            2 {
                $lblTitle.Text = 'Agent-Paket'
                $lblBody.Text = 'Wählen Sie, wie das Installations-ZIP bezogen werden soll.'
                if ($script:WizardZipPath) {
                    $lblZipPath.Text = (Split-Path $script:WizardZipPath -Leaf)
                }
                $btnBrowseZip.Visible = $rbLocal.Checked
            }
            3 {
                $lblTitle.Text = 'Installation läuft…'
                $lblBody.Text = ''
                $btnNext.Enabled = $false
                $btnBack.Enabled = $false
                $btnCancel.Enabled = $false
            }
            4 {
                $lblTitle.Text = 'Fertig'
                $progress.Visible = $false
                $btnNext.Text = 'Schließen'
                $btnNext.Enabled = $true
                $btnCancel.Visible = $false
            }
        }
    }

    $btnBrowseDir.Add_Click({
        $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
        $dlg.Description = 'Installationsordner wählen'
        $dlg.SelectedPath = $txtInstallDir.Text
        if ($dlg.ShowDialog() -eq 'OK') { $txtInstallDir.Text = $dlg.SelectedPath }
    })

    $btnBrowseZip.Add_Click({
        $ofd = New-Object System.Windows.Forms.OpenFileDialog
        $ofd.Filter = 'ZIP-Dateien (*.zip)|*.zip'
        $ofd.Title = 'Alamida Agent ZIP'
        if ($ofd.ShowDialog() -eq 'OK') {
            $script:WizardZipPath = $ofd.FileName
            $lblZipPath.Text = $ofd.FileName
        }
    })

    $rbLocal.Add_CheckedChanged({ $btnBrowseZip.Visible = $rbLocal.Checked -and $script:WizardStep -eq 2 })

    $btnNext.Add_Click({
        if ($script:WizardStep -eq 4) {
            $form.Close()
            return
        }
        if ($script:WizardStep -eq 1) {
            $script:WizardInstallDir = $txtInstallDir.Text.Trim()
            if (-not $script:WizardInstallDir) {
                [System.Windows.Forms.MessageBox]::Show('Bitte Installationsordner angeben.', 'Hinweis') | Out-Null
                return
            }
        }
        if ($script:WizardStep -eq 2) {
            if ($rbLocal.Checked) {
                if (-not $script:WizardZipPath -or -not (Test-Path $script:WizardZipPath)) {
                    [System.Windows.Forms.MessageBox]::Show('Bitte eine ZIP-Datei wählen.', 'Hinweis') | Out-Null
                    return
                }
                $script:WizardUseLocalZip = $true
            } else {
                $script:WizardUseLocalZip = $false
            }
        }
        if ($script:WizardStep -eq 2) {
            Set-StepControls 3
            $form.Refresh()
            try {
                Run-WizardInstall
                Set-StepControls 4
                $lblBody.Text = $script:WizardResultText
            } catch {
                [System.Windows.Forms.MessageBox]::Show(
                    "Installation fehlgeschlagen:`n$($_.Exception.Message)",
                    'Fehler', 'OK', 'Error') | Out-Null
                Set-StepControls 2
            }
            return
        }
        Set-StepControls ($script:WizardStep + 1)
    })

    $btnBack.Add_Click({ if ($script:WizardStep -gt 0) { Set-StepControls ($script:WizardStep - 1) } })
    $btnCancel.Add_Click({ $form.Close() })

    function Run-WizardInstall {
        $installDir = $script:WizardInstallDir
        $tempZip = Join-Path ([System.IO.Path]::GetTempPath()) $script:AlamidaAssetFileName

        $lblStatus.Text = 'Bitte warten…'
        $form.Refresh()

        if ($script:WizardUseLocalZip) {
            $lblStatus.Text = 'Entpacke lokales ZIP…'
            $form.Refresh()
            Expand-AlamidaAgentZip -ZipPath $script:WizardZipPath -InstallDir $installDir
        } else {
            $lblStatus.Text = 'Lade Release von GitHub…'
            $form.Refresh()
            Save-AlamidaAgentZip -DestinationPath $tempZip -OnProgress {
                param($m)
                $lblStatus.Text = $m
                $form.Refresh()
            }
            $lblStatus.Text = 'Entpacke…'
            $form.Refresh()
            Expand-AlamidaAgentZip -ZipPath $tempZip -InstallDir $installDir
        }

        $lblStatus.Text = 'Richte Agent ein (Firebase, Autostart)…'
        $form.Refresh()
        $setup = Initialize-AlamidaAgentSetup -InstallDir $installDir

        $lblStatus.Text = 'Erstelle Desktop-Verknüpfung…'
        $form.Refresh()
        Register-AlamidaWallDesktopShortcut -InstallDir $installDir

        $lblStatus.Text = 'Starte Agent…'
        $form.Refresh()
        Start-AlamidaAgentIfNeeded -InstallDir $installDir

        $fbHint = if ($setup.HasFirebase) {
            'Firebase: verbunden'
        } else {
            "Firebase: bitte serviceAccount.json nach`n$($setup.CredPath)`nlegen"
        }

        $script:WizardResultText = @"
Installation abgeschlossen.

Ordner: $installDir
Autostart: Agent registriert
Desktop: „Alamida Wandmonitor“
$fbHint

Die Wandmonitor-Verknüpfung prüft bei jedem Start auf Agent-Updates und öffnet dann:
$script:AlamidaWallUrl
"@
        $lblStatus.Text = 'Fertig.'
    }

    Set-StepControls 0
    if ($nearbyZip) { $rbLocal.Checked = $true; $lblZipPath.Text = (Split-Path $nearbyZip -Leaf) }

    [void]$form.ShowDialog()
}

Show-WizardForm
