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

    public TrayApplicationContext(Core.Models.AgentConfig config, FieldMappingProfile profile)
    {
        _config = config;
        var firestore = FirestoreClientFactory.TryCreate(
            config.FirebaseProjectId,
            config.WorkstationId);

        _loop = new WatcherLoop(profile, firestore, config.PollIntervalMs);
        _loop.StatusChanged += s =>
        {
            var text = $"Alamida Monitoring — {s}";
            _tray.Text = text.Length > 63 ? text[..63] : text;
        };
        _loop.ErrorOccurred += ex => ShowBalloon($"Fehler: {ex.Message}");

        _tray = new NotifyIcon
        {
            Icon = SystemIcons.Application,
            Visible = true,
            Text = "Alamida Monitoring",
        };

        _tray.ContextMenuStrip = BuildMenu();
        _loop.Start();

        if (firestore == null)
            ShowBalloon("Firestore nicht verbunden — setup-complete.ps1 ausführen");
        else
            ShowBalloon("Firestore verbunden");
    }

    private ContextMenuStrip BuildMenu()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add("Status", null, (_, _) =>
            MessageBox.Show(_tray.Text, "Alamida Monitoring Agent"));
        menu.Items.Add("Inspector (Fenster-Dump)", null, (_, _) => RunInspector());
        menu.Items.Add("Konfiguration öffnen", null, (_, _) =>
        {
            var dir = Path.GetDirectoryName(_config.ServiceAccountPath)!;
            Directory.CreateDirectory(dir);
            Process.Start("explorer.exe", dir);
        });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Beenden", null, (_, _) => ExitThread());
        return menu;
    }

    private void RunInspector()
    {
        var profile = FieldMappingProfile.Load(_config.FieldMappingPath);
        var dump = UiInspector.DumpAllWindows(profile.WindowTitlePatterns);
        var outPath = Path.Combine(
            Path.GetDirectoryName(_config.FieldMappingPath) ?? ".",
            "inspector-dump.txt");
        File.WriteAllText(outPath, dump);
        MessageBox.Show($"Dump gespeichert:\n{outPath}", "UI Inspector");
    }

    private void ShowBalloon(string text) =>
        _tray.ShowBalloonTip(3000, "Alamida Monitoring", text, ToolTipIcon.Info);

    protected override void ExitThreadCore()
    {
        _loop.Stop();
        _tray.Visible = false;
        _tray.Dispose();
        base.ExitThreadCore();
    }
}
