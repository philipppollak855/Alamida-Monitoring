using Alamida.Monitoring.Agent;
using Alamida.Monitoring.Profiles;
using Alamida.Monitoring.Watcher;

namespace Alamida.Monitoring.Agent;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
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
            var dump = UiInspector.DumpAllWindows(profile.WindowTitlePatterns);
            var outPath = Path.Combine(Path.GetDirectoryName(config.FieldMappingPath)!, "inspector-dump.txt");
            File.WriteAllText(outPath, dump);
            Console.WriteLine($"Inspector-Dump: {outPath}");
            return;
        }

        if (args.Contains("--once"))
        {
            var watcher = new DetailMaskWatcher(profile);
            var snap = watcher.TryCaptureSnapshot();
            Console.WriteLine(snap == null
                ? "Kein Snapshot (Alamida nicht offen?)"
                : System.Text.Json.JsonSerializer.Serialize(snap, new System.Text.Json.JsonSerializerOptions { WriteIndented = true }));
            return;
        }

        if (args.Contains("--seed"))
        {
            var firestore = Core.Firestore.FirestoreClientFactory.TryCreate(
                config.FirebaseProjectId, config.WorkstationId);
            if (firestore == null)
            {
                Console.WriteLine("Firestore nicht verbunden. setup-complete.ps1 ausführen.");
                return;
            }
            var demo = new Core.Models.DetailSnapshot
            {
                SterbefallId = "DEMO-001",
                VerstorbenerName = "Max Mustermann",
                Kuehlraum = "3",
                VonOrt = "Krankenhaus Wien",
                NachOrt = "Kuehlraum",
                AbholungAm = DateTime.Now.ToString("dd.MM.yyyy"),
            };
            firestore.SyncSnapshotAsync(demo).GetAwaiter().GetResult();
            Console.WriteLine("Demo-Daten DEMO-001 nach Firestore geschrieben.");
            return;
        }

        Application.Run(new TrayApplicationContext(config, profile));
    }
}
