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
            ApplicationConfiguration.Initialize();

        var config = ConfigLoader.Load();

        if (!File.Exists(config.FieldMappingPath))
        {
            MessageBox.Show(
                $"Field-Mapping nicht gefunden:\n{config.FieldMappingPath}\n\nBitte docs/field-mapping-9.2.1.json kopieren.",
                "Alamida Monitoring",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        var profile = FieldMappingProfile.Load(config.FieldMappingPath);

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
                config.FirebaseProjectId, config.WorkstationId, out var fsError);
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
                var written = firestore.SyncSnapshotAsync(snap).GetAwaiter().GetResult();
                WriteSyncLog(
                    (written ? "Firestore Sync OK" : "Unveraendert (kein Duplikat)") +
                    $" — {snap.SterbefallId} ({snap.Schritte.Count} Schritte)\n" +
                    System.Text.Json.JsonSerializer.Serialize(snap, MonitoringJson.Options));
            }
            catch (Exception ex)
            {
                WriteSyncLog($"Firestore-Fehler: {ex.Message}");
            }
            return;
        }

        Application.Run(new TrayApplicationContext(config, profile));
    }
}
