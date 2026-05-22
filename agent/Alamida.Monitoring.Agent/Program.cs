using System.Runtime.InteropServices;
using Alamida.Monitoring.Agent;
using Alamida.Monitoring.Core.Json;
using Alamida.Monitoring.Profiles;
using Alamida.Monitoring.Watcher;

namespace Alamida.Monitoring.Agent;

internal static class Program
{
    private const int AttachParentProcess = -1;

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AllocConsole();

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AttachConsole(int dwProcessId);

    [STAThread]
    private static void Main(string[] args)
    {
        var isCli = args.Contains("--inspect") || args.Contains("--once") || args.Contains("--seed")
            || args.Contains("--sync");
        if (isCli)
        {
            // Ausgabe in die aufrufende CMD (dotnet run), nicht in ein separates Fenster
            if (!AttachConsole(AttachParentProcess))
                AllocConsole();
            Console.OutputEncoding = System.Text.Encoding.UTF8;
        }
        else
        {
            ApplicationConfiguration.Initialize();
            Application.ThreadException += (_, e) => LogTrayCrash(e.Exception);
            AppDomain.CurrentDomain.UnhandledException += (_, e) =>
                LogTrayCrash(e.ExceptionObject as Exception ?? new Exception(e.ExceptionObject?.ToString()));
        }

        var config = ConfigLoader.Load();
        LogAgentStartup($"Start, Mapping={config.FieldMappingPath}");

        if (!File.Exists(config.FieldMappingPath))
        {
            LogAgentStartup($"FEHLER: Mapping fehlt: {config.FieldMappingPath}");
            MessageBox.Show(
                $"Field-Mapping nicht gefunden:\n{config.FieldMappingPath}\n\nBitte docs/field-mapping-9.2.1.json kopieren oder Wizard erneut ausfuehren.",
                "Alamida Monitoring",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        FieldMappingProfile profile;
        try
        {
            profile = FieldMappingProfile.Load(config.FieldMappingPath);
        }
        catch (Exception ex)
        {
            LogTrayCrash(ex);
            MessageBox.Show(
                $"Field-Mapping ungueltig:\n{config.FieldMappingPath}\n\n{ex.Message}",
                "Alamida Monitoring",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return;
        }

        if (args.Contains("--inspect"))
        {
            string dump;
            try
            {
                dump = UiInspector.DumpAllWindows(profile.WindowTitlePatterns);
            }
            catch (Exception ex)
            {
                dump = $"FEHLER beim UI-Scan: {ex.Message}\n{ex.StackTrace}";
            }
            var outCandidates = new[]
            {
                Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "docs", "inspector-dump.txt")),
                Path.Combine(Path.GetDirectoryName(config.FieldMappingPath)!, "inspector-dump.txt"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "AlamidaMonitoring", "inspector-dump.txt"),
            };
            var outPath = outCandidates.First();
            Directory.CreateDirectory(Path.GetDirectoryName(outPath)!);
            var utf8NoBom = new System.Text.UTF8Encoding(encoderShouldEmitUTF8Identifier: false);
            File.WriteAllText(outPath, dump, utf8NoBom);

            var summary = $"""
                === Alamida UI Inspector ===
                Gespeichert: {outPath}
                Zeilen: {dump.Split('\n').Length}
                {(dump.Contains("WINDOW: Alamida") ? "Alamida-Fenster gefunden." : "WARNUNG: Alamida-Fenster nicht im Dump!")}
                Oeffnen Sie die Datei inspector-dump.txt im Editor.
                """;

            Console.WriteLine(summary);
            var utf8Bom = new System.Text.UTF8Encoding(encoderShouldEmitUTF8Identifier: true);
            var resultPath = Path.Combine(Path.GetDirectoryName(outPath)!, "inspect-last-run.txt");
            File.WriteAllText(resultPath, summary + "\n" + DateTime.Now, utf8Bom);

            return;
        }

        if (args.Contains("--once"))
        {
            var watcher = new AlamidaMaskWatcher(profile);
            var snap = watcher.TryCaptureSnapshot(out var fieldDebug);
            var utf8NoBom = new System.Text.UTF8Encoding(encoderShouldEmitUTF8Identifier: false);
            string body;
            if (snap == null)
            {
                body = """
                    Kein Snapshot.
                    - Alamida-Fenster offen? (Titel enthält "Alamida")
                    - Sterbefall-Detail, Tab "Termine" aktiv?
                    """;
            }
            else
            {
                body = System.Text.Json.JsonSerializer.Serialize(snap, MonitoringJson.Options);
                if (!snap.HasMinimumData && !string.IsNullOrWhiteSpace(fieldDebug))
                    body += "\n\n--- Rohfelder ---\n" + fieldDebug;
            }

            var docsDir = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "docs"));
            if (!Directory.Exists(docsDir))
                docsDir = Path.GetDirectoryName(config.FieldMappingPath)!;

            var summary = $"""
                === Alamida Snapshot (--once) ===
                Mapping: {config.FieldMappingPath}
                {(snap == null ? "Status: FEHLER – kein Fenster" : "Status: OK")}
                {body}
                """;

            Console.WriteLine(summary);
            Console.Out.Flush();

            var utf8Bom = new System.Text.UTF8Encoding(encoderShouldEmitUTF8Identifier: true);
            var resultPath = Path.Combine(docsDir, "once-last-run.txt");
            Directory.CreateDirectory(docsDir);
            File.WriteAllText(resultPath, summary + "\n" + DateTime.Now, utf8Bom);
            Console.WriteLine($"Gespeichert: {resultPath}");
            Console.Out.Flush();
            return;
        }

        if (args.Contains("--sync") || args.Contains("--seed"))
        {
            void WriteSyncLog(string message)
            {
                Console.WriteLine(message);
                Console.Out.Flush();
                var docsDir = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "docs"));
                if (!Directory.Exists(docsDir))
                    docsDir = Path.GetDirectoryName(config.FieldMappingPath)!;
                Directory.CreateDirectory(docsDir);
                var logPath = Path.Combine(docsDir, "sync-last-run.txt");
                File.WriteAllText(logPath, message + Environment.NewLine + DateTime.Now,
                    new System.Text.UTF8Encoding(encoderShouldEmitUTF8Identifier: true));
            }

            var firestore = Core.Firestore.FirestoreClientFactory.TryCreate(
                config.FirebaseProjectId, config.WorkstationId, config.ServiceAccountPath, out var fsError);
            if (firestore == null)
            {
                WriteSyncLog(fsError ?? "Firestore nicht verbunden. scripts\\setup-complete.ps1 ausführen.");
                return;
            }

            if (args.Contains("--seed"))
            {
                try
                {
                    var demo = new Core.Models.DetailSnapshot
                    {
                        SterbefallId = "DEMO-001",
                        VerstorbenerName = "Max Mustermann",
                        Kuehlraum = "Kühlr. Grafenbach",
                        Schritte =
                        [
                            new Core.Models.UeberfuehrungSchritt
                            {
                                Zeile = 1,
                                SchrittTyp = "abholung",
                                VonOrt = "UK Neunkirchen",
                                NachOrt = "Kühlr. Grafenbach",
                                TerminAm = DateTime.Now.ToString("dd.MM.yyyy"),
                            },
                        ],
                    };
                    firestore.SyncSnapshotAsync(demo).GetAwaiter().GetResult();
                    WriteSyncLog("Demo-Daten DEMO-001 nach Firestore geschrieben.");
                }
                catch (Exception ex)
                {
                    WriteSyncLog($"Firestore-Fehler: {ex.Message}");
                }
                return;
            }

            var watcher = new AlamidaMaskWatcher(profile);
            var snap = watcher.TryCaptureSnapshot();
            if (snap == null || !snap.HasMinimumData)
            {
                WriteSyncLog("Kein Snapshot — Alamida (Tab Termine) muss offen sein.");
                return;
            }

            try
            {
                var syncResult = firestore
                    .SyncSnapshotAsync(snap, sterbefallWechsel: false, CancellationToken.None)
                    .GetAwaiter()
                    .GetResult();
                var id = syncResult.SterbefallId ?? snap.SterbefallId ?? "?";
                WriteSyncLog(
                    syncResult.FormatSyncLogLine(id, snap.Schritte.Count) + "\n" +
                    System.Text.Json.JsonSerializer.Serialize(snap, MonitoringJson.Options));
            }
            catch (Exception ex)
            {
                WriteSyncLog($"Firestore-Fehler: {ex.Message}");
            }
            return;
        }

        if (TryRunStartupAutoUpdate(config, out var updateMsg))
        {
            LogAgentStartup($"Beende fuer Auto-Update: {updateMsg}");
            MessageBox.Show(
                updateMsg ?? "Ein Agent-Update wird installiert. Der Agent startet danach neu.",
                "Alamida Monitoring",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        try
        {
            LogAgentStartup("Tray starten");
            Application.Run(new TrayApplicationContext(config, profile));
        }
        catch (Exception ex)
        {
            LogTrayCrash(ex);
            MessageBox.Show(
                $"Der Agent konnte nicht starten:\n{ex.Message}\n\nDetails: %AppData%\\AlamidaMonitoring\\agent-crash.log",
                "Alamida Monitoring",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }

    private static void LogTrayCrash(Exception? ex)
    {
        if (ex == null) return;
        try
        {
            var dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "AlamidaMonitoring");
            Directory.CreateDirectory(dir);
            File.AppendAllText(
                Path.Combine(dir, "agent-crash.log"),
                $"[{DateTime.Now:O}] {ex}\n\n");
        }
        catch { /* ignore */ }
    }

    private static bool TryRunStartupAutoUpdate(Core.Models.AgentConfig config, out string? message)
    {
        var checker = new AgentUpdateChecker(config.AutoUpdate, AppContext.BaseDirectory);
        return checker.TryApplyUpdateIfAvailable(out message);
    }

    private static void LogAgentStartup(string line)
    {
        try
        {
            var dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "AlamidaMonitoring");
            Directory.CreateDirectory(dir);
            File.AppendAllText(
                Path.Combine(dir, "agent-startup.log"),
                $"[{DateTime.Now:O}] {line}\n");
        }
        catch { /* ignore */ }
    }
}
