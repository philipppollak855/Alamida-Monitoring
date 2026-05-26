using System.Text.Json;
using Alamida.Monitoring.Core.Json;

namespace Alamida.Monitoring.Core.Firestore;

public sealed class SterbefallFirestoreCache
{
    private readonly string _path;
    private readonly object _lock = new();
    private Dictionary<string, Entry> _entries = new(StringComparer.Ordinal);

    public SterbefallFirestoreCache()
    {
        var dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "AlamidaMonitoring");
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "sterbefall-sync-cache.json");
        Load();
    }

    public Entry? Get(string sterbefallId)
    {
        lock (_lock)
            return _entries.GetValueOrDefault(sterbefallId);
    }

    public void Save(
        string sterbefallId,
        string contentHash,
        bool hasDispositionData,
        bool inHistory)
    {
        lock (_lock)
        {
            _entries[sterbefallId] = new Entry(
                contentHash,
                hasDispositionData,
                inHistory,
                DateTime.UtcNow);
            Persist();
        }
    }

    private void Load()
    {
        if (!File.Exists(_path)) return;
        try
        {
            var list = JsonSerializer.Deserialize<List<EntryDto>>(File.ReadAllText(_path), MonitoringJson.Options);
            if (list == null) return;
            _entries = list.ToDictionary(
                e => e.SterbefallId,
                e => new Entry(e.ContentHash, e.HasDispositionData, e.InHistory, e.LastSyncedUtc),
                StringComparer.Ordinal);
        }
        catch
        {
            _entries = new Dictionary<string, Entry>(StringComparer.Ordinal);
        }
    }

    private void Persist()
    {
        var list = _entries.Select(kv => new EntryDto(
            kv.Key,
            kv.Value.ContentHash,
            kv.Value.HasDispositionData,
            kv.Value.InHistory,
            kv.Value.LastSyncedUtc)).ToList();
        File.WriteAllText(_path, JsonSerializer.Serialize(list, MonitoringJson.Options));
    }

    public sealed record Entry(
        string ContentHash,
        bool HasDispositionData,
        bool InHistory,
        DateTime LastSyncedUtc);

    private sealed record EntryDto(
        string SterbefallId,
        string ContentHash,
        bool HasDispositionData,
        bool InHistory,
        DateTime LastSyncedUtc);
}
