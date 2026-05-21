using System.Text.Json;
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

    public void Enqueue(DetailSnapshot snapshot)
    {
        lock (_lock)
        {
            var list = Load();
            list.Add(snapshot);
            Save(list);
        }
    }

    public async Task FlushAsync(FirestoreSyncService firestore, CancellationToken ct)
    {
        List<DetailSnapshot> list;
        lock (_lock)
        {
            list = Load();
            if (list.Count == 0) return;
            Save([]);
        }

        foreach (var snap in list)
        {
            try
            {
                await firestore.SyncSnapshotAsync(snap, ct);
            }
            catch
            {
                lock (_lock)
                {
                    var current = Load();
                    current.Add(snap);
                    Save(current);
                }
                throw;
            }
        }
    }

    private List<DetailSnapshot> Load()
    {
        if (!File.Exists(_queuePath)) return [];
        try
        {
            return JsonSerializer.Deserialize<List<DetailSnapshot>>(File.ReadAllText(_queuePath)) ?? [];
        }
        catch
        {
            return [];
        }
    }

    private void Save(List<DetailSnapshot> list) =>
        File.WriteAllText(_queuePath, JsonSerializer.Serialize(list));
}
