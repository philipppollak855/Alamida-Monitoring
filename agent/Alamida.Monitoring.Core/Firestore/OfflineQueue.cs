using System.Text.Json;
using Alamida.Monitoring.Core.Json;
using Alamida.Monitoring.Core.Models;

namespace Alamida.Monitoring.Core.Firestore;

public sealed class OfflineQueue
{
    public const int DefaultMaxFlushPerCycle = 4;
    private static readonly TimeSpan DelayBetweenFlushItems = TimeSpan.FromMilliseconds(450);

    private readonly string _queuePath;
    private readonly object _lock = new();

    public OfflineQueue()
    {
        var dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "AlamidaMonitoring");
        Directory.CreateDirectory(dir);
        _queuePath = Path.Combine(dir, "pending-snapshots.json");
        CompactOnDisk();
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
            var key = QueueKey(snapshot);
            list.RemoveAll(s => string.Equals(QueueKey(s), key, StringComparison.Ordinal));
            list.Add(snapshot);
            Save(list);
        }
    }

    /// <summary>Schreibt wartende Snapshots; fehlgeschlagene bleiben in der Queue.</summary>
    public Task<FlushResult> FlushAsync(FirestoreSyncService firestore, CancellationToken ct) =>
        FlushAsync(firestore, DefaultMaxFlushPerCycle, ct);

    public async Task<FlushResult> FlushAsync(
        FirestoreSyncService firestore,
        int maxItems,
        CancellationToken ct)
    {
        if (maxItems < 1) maxItems = 1;

        List<DetailSnapshot> batch;
        int remaining;
        lock (_lock)
        {
            var list = Compact(Load());
            if (list.Count == 0)
                return new FlushResult(0, 0, 0, null);

            batch = list.Take(maxItems).ToList();
            remaining = list.Count - batch.Count;
            Save(list.Skip(maxItems).ToList());
        }

        var ok = 0;
        var failed = new List<DetailSnapshot>();
        Exception? lastError = null;

        for (var i = 0; i < batch.Count; i++)
        {
            if (i > 0)
                await Task.Delay(DelayBetweenFlushItems, ct);

            var snap = batch[i];
            try
            {
                await FirestoreRetry.ExecuteAsync(
                    () => firestore.SyncSnapshotAsync(snap, ct),
                    ct);
                ok++;
            }
            catch (Exception ex)
            {
                lastError = ex;
                failed.Add(snap);
                if (FirestoreRetry.IsTransient(ex))
                    break;
            }
        }

        if (failed.Count > 0)
        {
            lock (_lock)
            {
                var current = Compact(Load());
                foreach (var snap in failed)
                {
                    var key = QueueKey(snap);
                    current.RemoveAll(s => string.Equals(QueueKey(s), key, StringComparison.Ordinal));
                    current.Add(snap);
                }

                Save(current);
                remaining = current.Count;
            }
        }

        return new FlushResult(ok, failed.Count, remaining, lastError);
    }

    public void CompactOnDisk()
    {
        lock (_lock)
        {
            var list = Load();
            if (list.Count == 0) return;
            Save(CompactSnapshots(list));
        }
    }

    public static List<DetailSnapshot> CompactSnapshots(IEnumerable<DetailSnapshot> snapshots) =>
        Compact(snapshots.ToList());

    public static string QueueKey(DetailSnapshot snapshot)
    {
        if (!string.IsNullOrWhiteSpace(snapshot.SterbefallId))
            return $"id:{snapshot.SterbefallId.Trim()}";
        if (!string.IsNullOrWhiteSpace(snapshot.ErfassungSchluessel))
            return $"key:{snapshot.ErfassungSchluessel.Trim()}";
        if (!string.IsNullOrWhiteSpace(snapshot.VerstorbenerName))
            return $"name:{snapshot.VerstorbenerName.Trim()}";
        return $"hash:{snapshot.ContentHash()}";
    }

    private static List<DetailSnapshot> Compact(List<DetailSnapshot> list)
    {
        if (list.Count <= 1) return list;

        var map = new Dictionary<string, DetailSnapshot>(StringComparer.Ordinal);
        foreach (var snap in list)
            map[QueueKey(snap)] = snap;

        return map.Values.ToList();
    }

    public readonly record struct FlushResult(
        int Succeeded,
        int Failed,
        int Remaining,
        Exception? LastError);

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
