using System.Text.Json;
using Alamida.Monitoring.Core.Json;
using Alamida.Monitoring.Core.Models;

namespace Alamida.Monitoring.Core.Firestore;

public sealed class OfflineQueue
{
    private readonly string _queuePath;
    private readonly object _lock = new();

    public OfflineQueue()
    {
        var dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "AlamidaMonitoring");
        Directory.CreateDirectory(dir);
        _queuePath = Path.Combine(dir, "pending-snapshots.json");
    }

    public int PendingCount
    {
        get
        {
            lock (_lock)
                return Load().Count;
        }
    }

    public void Enqueue(DetailSnapshot snapshot)
    {
        lock (_lock)
        {
            var list = Load();
            list.Add(snapshot);
            Save(list);
        }
    }

    /// <summary>Schreibt wartende Snapshots; fehlgeschlagene bleiben in der Queue.</summary>
    public async Task<FlushResult> FlushAsync(FirestoreSyncService firestore, CancellationToken ct)
    {
        List<DetailSnapshot> list;
        lock (_lock)
        {
            list = Load();
            if (list.Count == 0)
                return new FlushResult(0, 0, null);
            Save([]);
        }

        var ok = 0;
        var failed = new List<DetailSnapshot>();
        Exception? lastError = null;

        foreach (var snap in list)
        {
            try
            {
                await firestore.SyncSnapshotAsync(snap, ct);
                ok++;
            }
            catch (Exception ex)
            {
                lastError = ex;
                failed.Add(snap);
            }
        }

        if (failed.Count > 0)
        {
            lock (_lock)
            {
                var current = Load();
                current.AddRange(failed);
                Save(current);
            }
        }

        return new FlushResult(ok, failed.Count, lastError);
    }

    public readonly record struct FlushResult(int Succeeded, int Failed, Exception? LastError);

    private List<DetailSnapshot> Load()
    {
        if (!File.Exists(_queuePath)) return [];
        try
        {
            return JsonSerializer.Deserialize<List<DetailSnapshot>>(
                File.ReadAllText(_queuePath), MonitoringJson.Options) ?? [];
        }
        catch
        {
            return [];
        }
    }

    private void Save(List<DetailSnapshot> list) =>
        File.WriteAllText(_queuePath, JsonSerializer.Serialize(list, MonitoringJson.Options));
}
