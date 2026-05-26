using System.Diagnostics;
using Alamida.Monitoring.Core.Firestore;
using Alamida.Monitoring.Profiles;
using Alamida.Monitoring.Watcher;

namespace Alamida.Monitoring.Agent;

public sealed class TrayApplicationContext : ApplicationContext
{
    private readonly NotifyIcon _tray;
    private readonly WatcherLoop _loop;
    private readonly Core.Models.AgentConfig _config;
    private readonly ToolStripMenuItem _statusZeile;
    private readonly ToolStripMenuItem _pauseItem;
    private readonly string? _firestoreHinweis;

    public TrayApplicationContext(Core.Models.AgentConfig config, FieldMappingProfile profile)
    {
        _config = config;
        var firestore = FirestoreClientFactory.TryCreate(
            config.FirebaseProjectId,
            config.WorkstationId,
            config.ServiceAccountPath,
            out var fsError);
        _firestoreHinweis = fsError;

        var settingsLoader = firestore?.CreateSettingsLoader();
        _loop = new WatcherLoop(profile, firestore, settingsLoader, config.PollIntervalMs);
        _loop.StatusChanged += OnStatusChanged;
        _loop.ErrorOccurred += ex => ShowBalloon($"Fehler: {ex.Message}", ToolTipIcon.Error);

        _statusZeile = new ToolStripMenuItem("Status: startet…") { Enabled = false };
        _pauseItem = new ToolStripMenuItem("Pausieren", null, (_, _) => TogglePause());

        _tray = new NotifyIcon
        {
            Icon = SystemIcons.Application,
            Visible = true,
            Text = "Alamida Monitoring",
        };
        _tray.ContextMenuStrip = BuildMenu();
        _tray.DoubleClick += (_, _) => ZeigeStatusDialog();

        _loop.Start();
        AktualisiereTrayText();

        if (firestore == null)
            ShowBalloon(fsError ?? "Firestore nicht verbunden", ToolTipIcon.Warning);
        else
        {
            ShowBalloon("Watcher gestartet", ToolTipIcon.Info);
            _ = VerifyFirestoreWriteAsync(config);
        }
    }

    private async Task VerifyFirestoreWriteAsync(Core.Models.AgentConfig config)
    {
        var path = FirestoreClientFactory.ResolveServiceAccountPath(config.ServiceAccountPath);
        var (ok, err) = await FirestoreClientFactory.VerifyWriteAccessAsync(
            config.FirebaseProjectId,
            path,
            config.WorkstationId);
        if (ok) return;

        ShowBalloon(
            err?.Split('\n')[0] ?? "Firestore-Schreibtest fehlgeschlagen",
            ToolTipIcon.Warning);
    }

    private ContextMenuStrip BuildMenu()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add(_statusZeile);
        menu.Items.Add(new ToolStripMenuItem("Status anzeigen…", null, (_, _) => ZeigeStatusDialog()));
        menu.Items.Add(new ToolStripMenuItem("Jetzt synchronisieren", null, (_, _) => _ = SyncJetztAsync()));
        menu.Items.Add(_pauseItem);
        menu.Items.Add(new ToolStripMenuItem("Neustarten", null, (_, _) => Neustarten()));
        menu.Items.Add(new ToolStripMenuItem("Update prüfen…", null, (_, _) => UpdatePruefen()));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripMenuItem("Web-Dashboard öffnen", null, (_, _) =>
            OeffneUrl("https://alamida---monitoring.web.app")));
        menu.Items.Add(new ToolStripMenuItem("Wandmonitor öffnen", null, (_, _) =>
            OeffneUrl("https://alamida---monitoring.web.app/wall")));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripMenuItem("Inspector (UI-Dump)", null, (_, _) => RunInspector()));
        menu.Items.Add(new ToolStripMenuItem("Konfiguration öffnen", null, (_, _) =>
        {
            var dir = Path.GetDirectoryName(_config.FieldMappingPath)
                ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "AlamidaMonitoring");
            Directory.CreateDirectory(dir);
            Process.Start(new ProcessStartInfo("explorer.exe", dir) { UseShellExecute = true });
        }));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripMenuItem("Beenden", null, (_, _) => ExitThread()));
        menu.Opening += (_, _) => AktualisiereMenueEintraege();
        return menu;
    }

    private void AktualisiereMenueEintraege()
    {
        var kurz = KurzStatus(_loop.LastStatus);
        _statusZeile.Text = _loop.IsPaused ? $"Status: Pausiert · {kurz}" : $"Status: {kurz}";
        _pauseItem.Text = _loop.IsPaused ? "Fortsetzen" : "Pausieren";
        _pauseItem.Image = null;
    }

    private void OnStatusChanged(string status)
    {
        if (_tray == null) return;
        AktualisiereTrayText(status);
        if (_statusZeile != null)
            _statusZeile.Text = _loop.IsPaused ? $"Status: Pausiert · {KurzStatus(status)}" : $"Status: {KurzStatus(status)}";
    }

    private void AktualisiereTrayText(string? status = null)
    {
        status ??= _loop.LastStatus;
        var prefix = _loop.IsPaused ? "[Pause] " : "";
        var text = $"Alamida Monitoring — {prefix}{status}";
        _tray.Text = text.Length > 63 ? text[..60] + "…" : text;
    }

    private static string KurzStatus(string status)
    {
        if (status.Length <= 48) return status;
        return status[..45] + "…";
    }

    private void TogglePause()
    {
        if (_loop.IsPaused)
        {
            _loop.Resume();
            ShowBalloon("Watcher fortgesetzt", ToolTipIcon.Info);
        }
        else
        {
            _loop.Pause();
            ShowBalloon("Watcher pausiert", ToolTipIcon.Info);
        }
        AktualisiereMenueEintraege();
        AktualisiereTrayText();
    }

    private void Neustarten()
    {
        try
        {
            _loop.Restart();
            ShowBalloon("Watcher neu gestartet", ToolTipIcon.Info);
        }
        catch (Exception ex)
        {
            ShowBalloon($"Neustart fehlgeschlagen: {ex.Message}", ToolTipIcon.Error);
        }
    }

    private void UpdatePruefen()
    {
        var checker = new AgentUpdateChecker(_config.AutoUpdate, AppContext.BaseDirectory);
        if (string.Equals(_config.AutoUpdate.Mode, "git", StringComparison.OrdinalIgnoreCase)
            && checker.ResolveRepoRoot() == null)
        {
            MessageBox.Show(
                "Kein Git-Repository gefunden.\n\n" +
                "Für Arbeitsplätze ohne Git: AutoUpdate:Mode auf \"release\" setzen " +
                "(Standard im ZIP-Release).",
                "Alamida Monitoring",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        if (!checker.IsUpdateAvailable())
        {
            ShowBalloon("Bereits aktuelle Version", ToolTipIcon.Info);
            return;
        }

        if (!checker.StartUpdateScript(apply: true))
        {
            ShowBalloon("Update-Skript konnte nicht gestartet werden", ToolTipIcon.Error);
            return;
        }

        ShowBalloon("Update wird installiert — Agent beendet sich kurz", ToolTipIcon.Info);
        Application.Exit();
    }

    private async Task SyncJetztAsync()
    {
        _pauseItem.Enabled = false;
        try
        {
            var ok = await _loop.SyncOnceAsync();
            ShowBalloon(
                ok ? "Synchronisation OK" : "Kein Sync — Alamida-Maske prüfen",
                ok ? ToolTipIcon.Info : ToolTipIcon.Warning);
        }
        finally
        {
            _pauseItem.Enabled = true;
        }
    }

    private void ZeigeStatusDialog()
    {
        var lines = new List<string>
        {
            $"Status: {_loop.LastStatus}",
            $"Watcher: {(_loop.IsRunning ? "läuft" : "gestoppt")}",
            $"Pausiert: {(_loop.IsPaused ? "ja" : "nein")}",
            $"PC: {_config.WorkstationId}",
            $"Poll: {_config.PollIntervalMs} ms",
            $"Mapping: {_config.FieldMappingPath}",
        };
        if (_firestoreHinweis != null)
        {
            lines.Add($"Firestore: {_firestoreHinweis}");
            var errLog = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "AlamidaMonitoring", "firestore-last-error.txt");
            if (File.Exists(errLog))
                lines.Add($"Log: {errLog}");
        }
        else
            lines.Add("Firestore: verbunden");

        var versionFile = Path.Combine(AppContext.BaseDirectory, "version.txt");
        if (File.Exists(versionFile))
            lines.Add($"Version: {File.ReadAllText(versionFile).Trim()}");
        if (_config.AutoUpdate.Enabled)
        {
            var mode = _config.AutoUpdate.Mode ?? "release";
            var detail = mode.Equals("git", StringComparison.OrdinalIgnoreCase)
                ? $"git/{_config.AutoUpdate.Branch}"
                : $"release/{_config.AutoUpdate.GitHubRepo}";
            lines.Add($"Auto-Update: {(_config.AutoUpdate.CheckOnStartup ? "beim Start" : "manuell")} ({detail})");
        }

        MessageBox.Show(
            string.Join(Environment.NewLine, lines),
            "Alamida Monitoring — Überwachung",
            MessageBoxButtons.OK,
            MessageBoxIcon.Information);
    }

    private static void OeffneUrl(string url) =>
        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });

    private void RunInspector()
    {
        var profile = FieldMappingProfile.Load(_config.FieldMappingPath);
        var dump = UiInspector.DumpAllWindows(profile.WindowTitlePatterns);
        var outPath = Path.Combine(
            Path.GetDirectoryName(_config.FieldMappingPath) ?? ".",
            "inspector-dump.txt");
        File.WriteAllText(outPath, dump, System.Text.Encoding.UTF8);
        MessageBox.Show($"Dump gespeichert:\n{outPath}", "UI Inspector");
    }

    private void ShowBalloon(string text, ToolTipIcon icon) =>
        _tray.ShowBalloonTip(4000, "Alamida Monitoring", text, icon);

    protected override void ExitThreadCore()
    {
        _loop.Stop();
        _tray.Visible = false;
        _tray.Dispose();
        base.ExitThreadCore();
    }
}
